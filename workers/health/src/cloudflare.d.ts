/** The one Workers module this Worker imports; the full set lives in @cloudflare/workers-types. */
declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
    readonly from: string;
    readonly to: string;
  }
}
