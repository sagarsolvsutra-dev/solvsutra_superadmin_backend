const { v4: uuidv4 } = require("uuid");

// Generate unique IDs with prefix
const generateId = (prefix = "") => {
  const uuid = uuidv4().replace(/-/g, "").slice(0, 12).toUpperCase();
  return prefix ? `${prefix}_${uuid}` : uuid;
};

// Generate specific IDs
const generateClientId = () => generateId("CLT");
const generateProjectId = () => generateId("PRJ");
const generatePlanId = () => generateId("PLN");
const generateSubscriptionId = () => generateId("SUB");
const generatePaymentId = () => generateId("PAY");
const generateNotificationId = () => generateId("NTF");
const generateServerId = () => generateId("SRV");
const generateDomainId = () => generateId("DMN");
const generateAssignmentId = () => generateId("ASG");
const generateMilestoneId = () => generateId("MST");
const generateEmployeeId = () => generateId("EMP");
const generateApiKey = () => {
  const prefix = "ss";
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}_${uuid}`;
};
const generateApiSecret = () => {
  return uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");
};

module.exports = {
  generateId,
  generateClientId,
  generateProjectId,
  generatePlanId,
  generateSubscriptionId,
  generatePaymentId,
  generateNotificationId,
  generateServerId,
  generateDomainId,
  generateAssignmentId,
  generateMilestoneId,
  generateEmployeeId,
  generateApiKey,
  generateApiSecret,
};
