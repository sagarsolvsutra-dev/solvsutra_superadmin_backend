// Date helper utilities

/**
 * Add duration to a date
 */
const addDuration = (date, duration, unit = "year") => {
  const result = new Date(date);
  switch (unit) {
    case "day":
      result.setDate(result.getDate() + duration);
      break;
    case "month":
      result.setMonth(result.getMonth() + duration);
      break;
    case "year":
      result.setFullYear(result.getFullYear() + duration);
      break;
    default:
      result.setFullYear(result.getFullYear() + duration);
  }
  return result;
};

/**
 * Get days remaining until expiry
 */
const getDaysRemaining = (expiryDate) => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Check if date is expired
 */
const isExpired = (expiryDate) => {
  return new Date(expiryDate) < new Date();
};

/**
 * Format date to Indian format
 */
const formatDateIndian = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Format date to ISO string
 */
const formatDateISO = (date) => {
  return new Date(date).toISOString().split("T")[0];
};

/**
 * Get start and end of a day
 */
const getDayBoundaries = (date = new Date()) => {
  const d = new Date(date);
  const start = new Date(d.setHours(0, 0, 0, 0));
  const end = new Date(d.setHours(23, 59, 59, 999));
  return { start, end };
};

/**
 * Get start and end of current month
 */
const getMonthBoundaries = (date = new Date()) => {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

/**
 * Get notification days based on expiry
 */
const getNotificationDays = (expiryDate, config = [90, 30, 15, 7, 3, 1]) => {
  const daysRemaining = getDaysRemaining(expiryDate);
  return config.filter((d) => d === daysRemaining);
};

module.exports = {
  addDuration,
  getDaysRemaining,
  isExpired,
  formatDateIndian,
  formatDateISO,
  getDayBoundaries,
  getMonthBoundaries,
  getNotificationDays,
};
