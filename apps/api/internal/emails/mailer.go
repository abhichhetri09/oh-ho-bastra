package emails

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/wneessen/go-mail"

	"github.com/suprimkhatri77/cartspace/backend/internal/config"
)

// Message is one email to one recipient.
type Message struct {
	To      string
	Subject string
	HTML    string
	Text    string
}

// Sender delivers an email.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// PermanentError is a send the server refused for good (an SMTP 5xx such
// as an unknown mailbox), so retrying can't help.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

const smtpTimeout = 30 * time.Second

// SMTP sends through any SMTP server: a provider (Resend, Postmark, SES...)
// in production, Mailpit in development.
type SMTP struct {
	host string
	from string
	opts []mail.Option
}

// NewSMTP builds the sender from a validated config (Config.ValidateMail).
func NewSMTP(cfg *config.Config) *SMTP {
	opts := []mail.Option{mail.WithTimeout(smtpTimeout)}
	switch cfg.SMTPTLS {
	case config.SMTPTLS:
		opts = append(opts, mail.WithSSL())
	case config.SMTPNoTLS:
		opts = append(opts, mail.WithTLSPolicy(mail.NoTLS))
	default:
		opts = append(opts, mail.WithTLSPolicy(mail.TLSMandatory))
	}
	// Never send a login over an unencrypted connection: with SMTP_TLS=none
	// (Mailpit in development) the credentials are left out, so a .env
	// holding a real provider's login still reaches the local catcher.
	if cfg.SMTPUsername != "" && cfg.SMTPTLS == config.SMTPNoTLS {
		slog.Warn("SMTP_TLS=none: SMTP_USERNAME/SMTP_PASSWORD are not sent over an unencrypted connection")
	}
	if cfg.SMTPUsername != "" && cfg.SMTPTLS != config.SMTPNoTLS {
		opts = append(opts,
			mail.WithSMTPAuth(mail.SMTPAuthAutoDiscover),
			mail.WithUsername(cfg.SMTPUsername),
			mail.WithPassword(cfg.SMTPPassword),
		)
	}
	// Last, so no option above resets it.
	opts = append(opts, mail.WithPort(cfg.SMTPPort))
	return &SMTP{host: cfg.SMTPHost, from: cfg.MailFrom, opts: opts}
}

func (s *SMTP) Send(ctx context.Context, m Message) error {
	msg := mail.NewMsg()
	if err := msg.From(s.from); err != nil {
		return &PermanentError{fmt.Errorf("from: %w", err)}
	}
	if err := msg.To(m.To); err != nil {
		return &PermanentError{fmt.Errorf("to: %w", err)}
	}
	msg.Subject(m.Subject)
	msg.SetMessageID()
	msg.SetDate()
	msg.SetBodyString(mail.TypeTextPlain, m.Text)
	msg.AddAlternativeString(mail.TypeTextHTML, m.HTML)

	client, err := mail.NewClient(s.host, s.opts...)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	conn, err := client.DialToSMTPClientWithContext(ctx)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	if err := client.SendWithSMTPClient(conn, msg); err != nil {
		_ = client.CloseWithSMTPClient(conn)
		var sendErr *mail.SendError
		if errors.As(err, &sendErr) && sendErr.ErrorCode() >= 500 {
			return &PermanentError{err}
		}
		return fmt.Errorf("send: %w", err)
	}
	// The server has accepted the message; a failed QUIT doesn't unsend it,
	// and reporting it would send the email again.
	if err := client.CloseWithSMTPClient(conn); err != nil {
		slog.Warn("emails: smtp close", "err", err)
	}
	return nil
}
