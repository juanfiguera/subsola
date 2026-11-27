/**
 * In-app browsers: the Google app, Facebook, Instagram, LinkedIn and the like open links in an
 * embedded WebKit view that iOS gives less memory than Safari, so a page that fits in Safari gets
 * killed and reloaded there. They get a smaller budget than other phones.
 */
const IN_APP = /\bGSA\/|\bFBAN\/|\bFBAV\/|\bInstagram\b|\bLinkedInApp\b|\bLine\/|\bSnapchat\b|\bPinterest\b|\bmusical_ly\b|\bBytedanceWebview\b/;

export const isInAppBrowser = (userAgent: string) => IN_APP.test(userAgent);
