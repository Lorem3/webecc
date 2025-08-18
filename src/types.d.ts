
declare const base64js :{
    toByteArray :(b64:string)=>Uint8Array,
    fromByteArray : (arr:Uint8Array,lineBreak ?:number )=>string
}



interface Blake2b {
    /**
     * Update the hash with new `input`. Calling this method after `.digest` will throw
     * an error.
     */
    update(input: Uint8Array): this;

    /**
     * Finalise the the hash and write the digest to `out`. `out` must be exactly equal
     * to `outLength` given in the `blake2b` method.
     *
     * Optionally you can pass `hex` to get the hash as a hex string or no arguments
     * to have the hash return a new Uint8Array with the hash.
     */
    digest(out?: 'binary'): Uint8Array;
    digest<TBuffer extends Uint8Array>(out: TBuffer): TBuffer;
    digest(out: 'hex'): string;
}
declare interface Blake2b {
    
}
declare interface Blake2bHelp {
     blake2bInit(outlen:number, key ?:Uint8Array, salt?:Uint8Array, personal?:Uint8Array):Blake2b
     blake2bUpdate(ctx:Blake2b,input:Uint8Array):void
     blake2bFinal(ctx:Blake2b):Uint8Array
}
declare const blake2b : Blake2bHelp



declare const X25519:{
    generateKeyPair(seed:Uint8Array):{public:Uint8Array,private:Uint8Array}
    sharedKey(private:Uint8Array,public:Uint8Array):Uint8Array
}


declare interface ZLIB {
    gzip(s:Uint8Array):Uint8Array
    ungzip(s:Uint8Array):Uint8Array
}

 

declare const exports:{
    default():void
    test:()=>void
    zlib:ZLIB,
    initEC:()=> Promise<EC>
}


declare function init():void

declare interface  EC{
    genRandomKeyBuffer(): Promise<Uint8Array>
    encrypt(pubBase64:string,data:Uint8Array,zipFist ?:boolean):Promise<Uint8Array>
    decrypt(privateKeyB64:string,data:Uint8Array):Promise<Uint8Array>
    generateNewKeyPair(seckey ?:string): Promise<{private:string,public:string}>

    base64Encode(arr:Uint8Array,urlsafe ?:1|0):string 
    base64Decode(str:string,urlsafe ?:1|0):Uint8Array
  }
declare function initEC():EC;


declare const __DEBUG__:boolean

declare const __BUILD_TIME__:string
declare const __BUILD_MOD__:string



interface CompressionStreamInit {
    flush?: number;
    chunkSize?: number;
    strategy?: number;
  }
  
declare class CompressionStream {
    constructor(format?: string)
  
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
  
    reset(): void;
}
declare class DecompressionStream {
    constructor(format?: string)
  
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
  
    reset(): void;
}

  