import mongoose from "mongoose";

/**
 * Escape regex special characters
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Optional normalization (replace with your normalizeString logic if needed)
 */
const normalizeString = (str) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
};

/**
 * Safely flatten nested objects into dot notation
 */
const flattenObject = (obj, parentKey = "", res = {}, seen = new WeakSet()) => {
  if (obj && typeof obj === "object") {
    if (seen.has(obj)) return res; // Prevent circular references
    seen.add(obj);
  }

  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
      continue; // Skip invalid types
    }

    const newKey = parentKey ? `${parentKey}.${key}` : key;

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof mongoose.Types.ObjectId) &&
      !("from" in value) &&
      !("to" in value)
    ) {
      flattenObject(value, newKey, res, seen);
    } else {
      res[newKey] = value;
    }
  }
  return res;
};

/**
 * Build a MongoDB condition for a single key/value
 */
const buildMatchCondition = (key, value) => {
  // Handle strings
  if (typeof value === "string" && value.trim()) {
    const safeValue = escapeRegex(normalizeString(value.trim()));
    return { [key]: { $regex: safeValue, $options: "i" } };
  }

  // Handle numbers
  if (typeof value === "number") {
    return { [key]: value };
  }

  // Handle exact dates
  if (value instanceof Date) {
    return { [key]: value };
  }

  // Handle ObjectId
  if (value instanceof mongoose.Types.ObjectId) {
    return { [key]: value };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object" && !Array.isArray(value[0])) {
      return { [key]: { $elemMatch: value[0] } };
    }
    return { [key]: { $in: value } };
  }

  // Handle date range
  if (typeof value === "object" && (value.from || value.to)) {
    const range = {};
    if (value.from) range.$gte = new Date(value.from);
    if (value.to) range.$lte = new Date(value.to);
    return { [key]: range };
  }

  // Handle plain object -> $elemMatch
  if (typeof value === "object" && value !== null) {
    return { [key]: { $elemMatch: value } };
  }

  return null;
};

/**
 * Main SearchQuery builder
 */
export const SearchQuery = (search = {}) => {
  const flatSearch = flattenObject(search);
  const matchConditions = [];

  for (const [key, value] of Object.entries(flatSearch)) {
    const condition = buildMatchCondition(key, value);
    if (condition) matchConditions.push(condition);
  }

  return matchConditions.length > 0
    ? { $match: { $and: matchConditions } }
    : null;
};
