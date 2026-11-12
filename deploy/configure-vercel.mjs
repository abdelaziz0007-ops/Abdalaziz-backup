import {writeFile} from 'node:fs/promises';
const input=process.argv[2];
if(!input)throw Error('Usage: node deploy/configure-vercel.mjs https://YOUR-SERVICE.onrender.com');
const url=new URL(input);
if(url.protocol!=='https:'||url.origin!==input||url.username||url.password||!url.hostname.endsWith('.onrender.com'))throw Error('Provide the actual HTTPS Render service origin, without path or credentials');
const config={
 '$schema':'https://openapi.vercel.sh/vercel.json',
 framework:'vite',buildCommand:'npm run build',outputDirectory:'dist',
 rewrites:[{source:'/api/:path*',destination:input+'/api/:path*'},{source:'/:path*',destination:'/index.html'}],
 headers:[{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]}]
};
await writeFile(new URL('../front/vercel.json',import.meta.url),JSON.stringify(config,null,2)+'\n');
console.log('Configured Vercel API proxy. Commit front/vercel.json before deploying.');
