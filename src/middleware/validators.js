// Validation helpers

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePhone = (phone) => {
  const re = /^[6-9]\d{9}$/;
  return re.test(phone);
};

const validateGstin = (gstin) => {
  const re = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return re.test(gstin);
};

const validateRequired = (fields) => {
  const missing = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!value || (typeof value === "string" && value.trim() === "")) {
      missing.push(key);
    }
  }
  return missing.length === 0 ? null : `Missing required fields: ${missing.join(", ")}`;
};

const sanitizeString = (str) => {
  if (typeof str !== "string") return str;
  return str.trim().replace(/[<>]/g, "");
};

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (!value || (typeof value === "string" && value.trim() === ""))) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && value !== null && value !== "") {
        if (rules.type === "email" && !validateEmail(value)) {
          errors.push(`${field} must be a valid email`);
        }
        if (rules.type === "phone" && !validatePhone(value)) {
          errors.push(`${field} must be a valid 10-digit phone number`);
        }
        if (rules.type === "gstin" && !validateGstin(value)) {
          errors.push(`${field} must be a valid GSTIN`);
        }
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`);
        }
        if (rules.min !== undefined && Number(value) < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && Number(value) > rules.max) {
          errors.push(`${field} must be at most ${rules.max}`);
        }
        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    next();
  };
};

module.exports = {
  validateEmail,
  validatePhone,
  validateGstin,
  validateRequired,
  sanitizeString,
  validate,
};
