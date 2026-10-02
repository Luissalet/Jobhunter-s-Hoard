// What a thrown error means to the person using the app. Before the shared error envelope every error that reached Express was
// answered "400 { error: message }" (the messages are written for people: "Guarda primero el borrador."), and the shared envelope
// answers a plain Error with a 500 "Internal error: ...". The routes and the agent tools throw plain Errors on purpose for
// "you cannot do that", so they are marked here as client errors with their message exposed; zod issues, errors that already carry
// a status (404, 409, 413...) and body-parser errors keep what they say.
export function userError(error) {
  if (error && typeof error === "object" && error.status === undefined && error.statusCode === undefined && !error.issues && !error.type) {
    error.status = 400;
    error.expose = true;
  }
  return error;
}

/** Express error middleware to install before installErrorHandlers(). */
export const userErrors = (error, req, res, next) => next(userError(error));
