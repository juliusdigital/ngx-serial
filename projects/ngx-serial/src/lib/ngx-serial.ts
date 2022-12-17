declare global {
   interface Navigator {
     readonly serial: Serial;
   }
 }

export class NgxSerial {

   private port!: SerialPort;
   private options: SerialOptions = { 
         baudRate: 9600, 
         dataBits: 8, 
         parity: 'none', 
         bufferSize: 256, 
         flowControl: 'none' 
      }; //Default
   // private writer: any;
   private writer!: WritableStreamDefaultWriter;
   private readFunction: Function;
   private controlCharacter: string = "\n";
   // private reader: any;
   private reader!: ReadableStreamDefaultReader;
   private readableStreamClosed: any;
   private writableStreamClosed: any;
   private keepReading: boolean = true;

   constructor(readFunction: Function, options?: SerialOptions, controlCharacter?: any) {
      this.readFunction = readFunction;
      if (options)
         this.options = options;
      if (controlCharacter)
         this.controlCharacter = controlCharacter;
   }

   public async sendData(data: string) {
      await this.writer.write(data);
   }

   private async readLoop() {
      while (this.port.readable && this.keepReading) {
         const textDecoder = new TextDecoderStream();
         this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
         this.reader = textDecoder.readable
            .pipeThrough(new TransformStream(new LineBreakTransformer(this.controlCharacter)))
            .getReader();

         try {
            while (true) {
               const { value, done } = await this.reader.read();
               if (done) {
                  break;
               }
               if (value) {
                  this.readFunction(value);
               }
            }
         } catch (error) {
            console.error("Read Loop error. Have the serial device been disconnected ? ");
         }
      }
   }

   public async close(callback: Function) {
      this.keepReading = false;
      this.reader.cancel();
      await this.readableStreamClosed.catch(() => { });
      this.writer.close();
      await this.writableStreamClosed;
      await this.port.close();
      callback(null);
   }

   public async requestPorts(options: SerialPortRequestOptions) {
      try {
         return await navigator.serial.requestPort(options);
      } catch (error) {
         console.error("requestPorts error: ", error, { options });
         return;
      }
   }

   public async getPortByVendorId(vendorId: number) {
      if (!("serial" in navigator)) { return undefined; }
      // Initialize the list of available ports with `ports` on page load.
      const availablePorts = await navigator.serial.getPorts();
      const foundPort = availablePorts.find( port => port.getInfo().usbVendorId == vendorId);
      return foundPort;
   }

   public async connect(port: SerialPort, callback: Function, err?: Function) {
      this.keepReading = true;

      if (!("serial" in navigator)) { 
         console.error("This browser does NOT support the Web Serial API");
         if (typeof err == 'function')
            err(port);
         return;
      }

      // The Web Serial API is supported by the browser.

      // try {
      //    const ports = await navigator.serial.getPorts();
      //    console.log("Got ports: ", ports);
      // } catch (error) {
      //    console.error("Getting ports error: " + error);
      // }

      // try {
      //    this.port = await navigator.serial.requestPort(options);
      // } catch (error) {
      //    console.error("requestPort error: ", error, {options});
      //    return;
      // }

      try {
         
         this.port = port;
         
         await this.port.open(this.options);

         const textEncoder = new TextEncoderStream();
      
         // Added
         if (!this.port.writable) { 
            console.error("Port doesn't have writable object");
            if (typeof err == 'function')
               err(port);
            return; 
         }
   
         this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
   
         this.writer = textEncoder.writable.getWriter();
   
         this.readLoop();
   
         callback(this.port);
         return;

      } catch (error) {
         console.error("Opening port error: " + error);
         if (typeof err == 'function')
            err(port);
         return;
      }

      // const textEncoder = new TextEncoderStream();
      
      // // Added
      // if (!this.port.writable) { 
      //    console.error("Port doesn't have writable object");
      //    return; 
      // }

      // this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);

      // this.writer = textEncoder.writable.getWriter();

      // this.readLoop();

      // callback(this.port);

   }
}

class LineBreakTransformer {
   container: any = "";
   private controlCharacter: string;

   constructor(controlCharacter: string) {
      this.container = '';
      this.controlCharacter = controlCharacter
   }

   transform(chunk: any, controller: any) {
      this.container += chunk;
      const lines = this.container.split(this.controlCharacter);
      this.container = lines.pop();
      lines.forEach((line: any) => controller.enqueue(line));
   }

   flush(controller: any) {
      controller.enqueue(this.container);
   }
}