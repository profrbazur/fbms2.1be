import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = ['super_admin', 'department_head', 'personnel', 'senior_leadership'];
export const AUTH_PROVIDERS = ['local', 'google'];
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      // V2.2: Senior Leadership is a second global (non-department) role
      // alongside Super Admin — see backend/docs/v2/V2_BACKEND_ARCHITECTURE.md.
      required: function departmentRequiredUnlessGlobalRole() {
        return this.role !== 'super_admin' && this.role !== 'senior_leadership';
      },
      default: null,
    },
    // ADR-006: provider is stored per-user so a future switch to "google"
    // does not require changing the authorization model (role/department
    // checks are provider-agnostic).
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      default: 'local',
    },
    googleSubjectId: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

userSchema.static('hashPassword', function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
});

userSchema.method('comparePassword', function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
});

const User = mongoose.model('User', userSchema);

export default User;
