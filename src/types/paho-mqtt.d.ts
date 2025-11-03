declare module "paho-mqtt" {
  export interface ConnectionLostResponse {
    errorCode: number;
    errorMessage?: string;
  }

  export class Message {
    payloadString: string;
    destinationName: string;
    constructor(payload: string | ArrayBuffer);
  }

  export class Client {
    // You can pass a full URL (wss://.../mqtt) and a clientId
    constructor(host: string, clientId?: string);
    // Or host/port/path, but we use the URL form above.

    connect(options?: {
      onSuccess?: () => void;
      onFailure?: (e: any) => void;
      userName?: string;
      password?: string;
      useSSL?: boolean;
      reconnect?: boolean;
      keepAliveInterval?: number;
      timeout?: number;
    }): void;

    subscribe(topic: string, options?: any): void;
    send(message: Message): void;
    disconnect(): void;

    onConnectionLost?: (responseObject: ConnectionLostResponse) => void;
    onMessageArrived?: (message: Message) => void;
  }
}