// Shared project model: contract states, review window and input validation.
export const STATUS = {
  CREATED: "Created",
  FUNDED: "Funded",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  DISPUTED: "Disputed",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
  EXTENSION_REQUESTED: "Extension Requested",
};

export const REVIEW_WINDOW_DAYS = 7;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Returns an object of field -> message. Empty object means the input is valid. */
export function validateProjectInput(input, now = Date.now()) {
  const e = {};
  const name = (input.name || "").trim();
  if (name.length < 3 || name.length > 80) e.name = "Enter a project name of 3 to 80 characters.";
  if ((input.description || "").trim().length < 20) e.description = "Describe the website in at least 20 characters so the developer knows what to build.";
  if (!input.pages?.length) e.pages = "Add at least one required page, for example Home or Contact.";
  if (!input.features?.length) e.features = "Add at least one required feature, for example a contact form.";

  const amount = String(input.amount ?? "").trim();
  const decimals = amount.split(".")[1]?.length ?? 0;
  if (!/^\d*\.?\d+$/.test(amount) || Number(amount) <= 0) e.amount = "Enter an escrow amount greater than 0.";
  else if (decimals > 18) e.amount = "Use at most 18 decimal places.";

  if (!ADDRESS.test((input.developerAddress || "").trim())) e.developerAddress = "Enter a wallet address that starts with 0x followed by 40 hex characters.";

  const deadline = new Date(input.deadline).getTime();
  if (!input.deadline || Number.isNaN(deadline)) e.deadline = "Choose a deadline date and time.";
  else if (deadline <= now) e.deadline = "Choose a deadline in the future.";
  return e;
}
