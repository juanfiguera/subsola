/**
 * In-app browsers: the Google app, Facebook, Instagram, LinkedIn and the like open links in an
 * embedded WebKit view that iOS gives less memory than Safari, so a page that fits in Safari gets
 * killed and reloaded there. They get a smaller budget than other phones.
 */
const IN_APP =
  /\bGSA\/|\bFBAN\/|\bFBAV\/|\bInstagram\b|\bLinkedInApp\b|\bLine\/|\bSnapchat\b|\bPinterest\b|\bmusical_ly\b|\bBytedanceWebview\b/;

export const isInAppBrowser = (userAgent: string) => IN_APP.test(userAgent);

/**
 * Whether this browser can draw the street and city maps, which both need WebGL 2. It can't with
 * hardware acceleration turned off, on some older or locked-down machines, and in most crawlers.
 */
export const canDrawWebGL2 = () => {
  const context = document.createElement('canvas').getContext('webgl2');
  // Browsers cap live contexts, and this one was only a question.
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  return Boolean(context);
};
