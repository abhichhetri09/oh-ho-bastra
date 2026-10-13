package constants

// Roles must match the CHECK constraint on users.role.
const (
	RoleCustomer = "customer"
	RoleAdmin    = "admin"
)

// ValidRoles are the roles allowed in access-token claims.
var ValidRoles = []string{RoleCustomer, RoleAdmin}

func IsValidRole(role string) bool {
	for _, r := range ValidRoles {
		if role == r {
			return true
		}
	}
	return false
}
