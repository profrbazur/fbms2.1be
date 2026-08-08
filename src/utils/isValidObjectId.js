import mongoose from 'mongoose';

/**
 * Guards against Mongoose CastErrors reaching the client as a raw 500 —
 * an id that is not a well-formed ObjectId can never match a document,
 * so callers treat it the same as "not found" (404).
 */
export function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}
