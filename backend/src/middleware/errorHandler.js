/**
 * Central Express error handler
 * Formats safe, clean JSON error responses and prevents credential or stack leaks
 */
export function errorHandler(err, req, res, next) {
  // Check for duplicate key MongoDB error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: 'DUPLICATE_RESOURCE',
      message: `A record with this ${field} already exists.`,
    });
  }

  // Handle Mongoose cast errors (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ID',
      message: `Invalid format for ${err.path}: ${err.value}`,
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: messages.join(', '),
    });
  }

  // Generic internal server error (never leak stack trace in production or sensitive data)
  console.error('[Error]', err.message, process.env.NODE_ENV !== 'production' ? err.stack : '');
  res.status(err.status || 500).json({
    success: false,
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected server error occurred',
  });
}
