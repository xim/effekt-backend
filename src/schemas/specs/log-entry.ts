/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */


/** Type helpers */
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U;
type OneOf<T extends any[]> = T extends [infer Only] ? Only : T extends [infer A, infer B, ...infer Rest] ? OneOf<[XOR<A, B>, ...Rest]> : never;

export type paths = Record<string, never>;

export interface components {
  schemas: {
    /**
     * @example {
     *   "id": 237,
     *   "label": "OCR",
     *   "timestamp": "2018-03-29T23:00:00.000Z",
     *   "meta": "Donations [ Added: 17 Invalid: 0 ] Agreements [ Activated: 1 Terminated: 0 ]"
     * }
     */
    LogEntry: {
      /** @description The Auto-generated id of an entry */
      id?: number;
      /** @description The type of log entry (e.g. OCR import, Avtlaegiro claims, Vipps recurring donations sync) */
      label?: string;
      /**
       * Format: date-time 
       * @description The date and time the log entry vas added
       */
      timestamp?: string;
      /** @description An optional short summary for the log entry */
      meta?: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export type external = Record<string, never>;

export type operations = Record<string, never>;
