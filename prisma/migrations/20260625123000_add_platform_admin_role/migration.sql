-- Add platform-level administrators without changing restaurant membership semantics.
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';
