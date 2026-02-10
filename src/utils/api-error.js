export function sendApiError(req, res, status, code, message) {
  return res.status(status).json({
    error: {
      code,
      message,
      requestId: req.requestId,
    },
  });
}