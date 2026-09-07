// Isolated preview data. Never touches the real application's data directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const data=fs.mkdtempSync(path.join(os.tmpdir(),'jobhunt-ui-'));
process.env.JOBHUNT_DATA_DIR=data;
process.env.PORT='19579';
const store=await import('../server/store.js');
store.updateSettings({personal:{name:'Persona de prueba',email:'',phone:'',location:'',github:'',portfolio:'',linkedin:''}});
const a=store.addJob({title:'AI Engineer · ejemplo de prueba',company:'Empresa de prueba A',workMode:'remote',url:'https://example.com/a',description:'Oferta ficticia para verificar la interfaz. Desarrollo de soluciones de IA. Trabajo remoto.'});
store.addJob({title:'Software Engineer · ejemplo de prueba',company:'Empresa de prueba B',workMode:'hybrid',url:'https://example.com/b'});
const apps=await import('../server/applications.js');
apps.saveDraft(a.id,{letterMarkdown:'Carta de prueba para revisar la interfaz. Sin candidatura real.',missing:['Confirmar disponibilidad'],answers:[{question:'¿Cuándo puedes incorporarte?',answer:'Pendiente de confirmar',source:'Dato de prueba'}]});
console.log(`Isolated UI preview: ${data}`);
await import('../server/index.js');
