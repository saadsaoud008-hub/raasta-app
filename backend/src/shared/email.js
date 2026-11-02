export function normalizeEmail(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Email must be a string.');
  const email = value.trim();
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))
    throw new Error('A valid email address is required.');
  return email;
}
