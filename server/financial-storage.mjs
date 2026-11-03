import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import { Files } from 'files-sdk';
import { neon } from 'files-sdk/neon';
import { hash } from './financial-core.mjs';

export function sourceStorage(){
  const key=process.env.SOURCE_ENCRYPTION_KEY;
  if(!/^[0-9a-f]{64}$/.test(key??'')||!['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_ENDPOINT_URL_S3','AWS_REGION'].every(k=>process.env[k]))return null;
  const files=new Files({adapter:neon({bucket:'financial-sources'})});
  return {
    async put(objectKey,plain){
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from(objectKey));
      const ciphertext=Buffer.concat([Buffer.from('MZN1'),iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
      await files.upload(objectKey,ciphertext,{contentType:'application/octet-stream'});
    },
    async verify(objectKey,expectedHash){
      const file=await files.download(objectKey),bytes=Buffer.from(await file.arrayBuffer());
      if(bytes.subarray(0,4).toString()!=='MZN1')throw Error('Invalid source envelope');
      const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(4,16));
      decipher.setAAD(Buffer.from(objectKey));decipher.setAuthTag(bytes.subarray(-16));
      const plain=Buffer.concat([decipher.update(bytes.subarray(16,-16)),decipher.final()]);
      if(hash(plain)!==expectedHash)throw Error('Source integrity mismatch');return true;
    },
  };
}
