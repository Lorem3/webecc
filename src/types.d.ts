
declare const base64js :{
    toByteArray :(b64:string)=>Uint8Array,
    fromByteArray : (arr:Uint8Array,lineBreak ?:number )=>string
}


 



declare interface ZLIB {
    gzip(s:Uint8Array):Uint8Array
    ungzip(s:Uint8Array):Uint8Array
}

 

declare const ECC:{
    initEC:()=> Promise<EC>
}


declare function init():void

declare interface  EC{
    genRandomKeyBuffer(): Promise<Uint8Array>
    encrypt(pubBase64:string,data:Uint8Array,zipFirst ?:boolean,format?:0|1):Promise<Uint8Array>
    decrypt(privateKeyB64:string,data:Uint8Array):Promise<Uint8Array>
    generateNewKeyPair(seckey ?:string): Promise<{private:string,public:string}>

    base64Encode(arr:Uint8Array,urlsafe ?:1|0):string
    base64Decode(str:string,urlsafe ?:1|0):Uint8Array
  }


declare const __DEBUG__:boolean

declare const __BUILD_TIME__:string
declare const __BUILD_MOD__:string


 
 
  