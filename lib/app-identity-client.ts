/// <reference path="../app/src/vite-env.d.ts" />
import app from 'virtual:recommand-app';

export type ClientAppIdentity = typeof app;

/**
 * The deployment's app identity in the browser (see lib/app-identity.ts):
 * the name, contact details and the URLs of the favicon and logos.
 */
export const appIdentity = app;
