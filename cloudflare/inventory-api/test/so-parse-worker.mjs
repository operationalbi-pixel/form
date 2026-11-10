// Local workerd harness only. Never attach this harness to a production route.
import {parseSoWorkbook} from '../lib/so-report.mjs';
export default {
  async fetch(request) {
    if(request.method!=='POST')return new Response('POST an XLSX fixture',{status:405});
    const input=await request.json(),started=Date.now();
    try {
      const report=parseSoWorkbook(input.base64,input.fileName,input.directory);
      return Response.json({rows:report.rows.length,outlets:report.outlets,elapsedMs:Date.now()-started});
    }catch(error){return Response.json({error:String(error.message)},{status:422});}
  }
};
