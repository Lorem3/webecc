
declare const base64js :{
    toByteArray :(b64:string)=>Uint8Array,
    fromByteArray : (arr:Uint8Array,lineBreak?:number,firstLineLess?:number)=>string
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

    base64Encode(arr:Uint8Array,urlsafe?:1|0,firstLineLess?:number):string
    base64Decode(str:string,urlsafe ?:1|0):Uint8Array
    deriveEcdhStreamKeys(pubBase64:string):Promise<{streamKey:Uint8Array, tmpPub:Uint8Array, macKey:Uint8Array}>
    assembleEcdhStreamHead(ssHeader:Uint8Array, tmpPub:Uint8Array, macKey:Uint8Array):Promise<Uint8Array>
    openEcdhStreamHead(privateKeyB64:string, head:Uint8Array):Promise<{streamKey:Uint8Array, ssHeader:Uint8Array}>
  }


declare const __DEBUG__:boolean
/** 超过此字节数走 X. 流式。由构建注入：发布 50MB，dev/测试 16MB。 */
declare const __LARGE_FILE_THRESHOLD__:number

declare const __BUILD_TIME__:string
declare const __BUILD_MOD__:string

interface DataTransferItem {
  webkitGetAsEntry(): FileSystemEntry | null;
}


 
 
  