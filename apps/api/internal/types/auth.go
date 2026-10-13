package types

// Passwords are never trimmed; bcrypt only uses the first 72 bytes, so max=72.
type RegisterRequest struct {
	Name     string `json:"name" label:"Name" binding:"required,not_blank,min=2,max=50,personname"`
	Email    string `json:"email" label:"Email" binding:"required,email,max=254" msg_email:"Enter a valid email address"`
	Password string `json:"password" label:"Password" trim:"-" binding:"required,min=8,max=72"`
}

type LoginRequest struct {
	Email    string `json:"email" label:"Email" binding:"required,email,max=254" msg_email:"Enter a valid email address"`
	Password string `json:"password" label:"Password" trim:"-" binding:"required,max=72"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" label:"Email" binding:"required,email,max=254" msg_email:"Enter a valid email address"`
}

// Token is the one from the emailed link; it isn't trimmed or changed.
type ResetPasswordRequest struct {
	Token    string `json:"token" label:"Reset link" trim:"-" binding:"required,max=100"`
	Password string `json:"password" label:"Password" trim:"-" binding:"required,min=8,max=72"`
}

type UpdateProfileRequest struct {
	Name string `json:"name" label:"Name" binding:"required,not_blank,min=2,max=50,personname"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" label:"Current password" trim:"-" binding:"required,max=72"`
	NewPassword     string `json:"new_password" label:"New password" trim:"-" binding:"required,min=8,max=72"`
}
