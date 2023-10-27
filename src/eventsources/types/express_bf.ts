import { expressApp } from './../../index';
import { GSCloudEvent, GSEventSource, GSStatus, PlainObject } from '@godspeedsystems/core';
import { EventSource as ExpressEventSource } from '@godspeedsystems/plugins-express-as-http';

class ExpressBrownField extends ExpressEventSource {
  public async initClient(): Promise<PlainObject> {
    return expressApp;
  }

  // subscribeToEvent(eventRoute: string, eventConfig: PlainObject, processEvent: (event: GSCloudEvent, eventConfig: PlainObject) => Promise<GSStatus>): Promise<void> {
  // Developer can override this to add custom middleware or express setup changes.
  // }
}

export default ExpressBrownField;