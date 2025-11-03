// A simple error handling middleware
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR: ${err.message}`);
  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const response = {
    error: {
      message: err.message || 'An internal server error occurred.',
      type: err.name || 'Error',
    },
  };

  // Handle specific custom errors if they are defined (e.g., ScraperError, ValidationError)
  if (err.name === 'ScraperError' || err.name === 'ValidationError') {
      response.error.details = err.details;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
