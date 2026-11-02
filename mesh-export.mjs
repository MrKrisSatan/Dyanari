import fs from 'node:fs';
import {Readable} from 'node:stream';
export const meshFormats = {stl:'model/stl', obj:'text/plain; charset=utf-8', ply:'application/octet-stream', glb:'model/gltf-binary'};

// Geometry exports use the inspected Z-up millimetre STL, not the unscaled source GLB.
export async function exportMesh(engine, id, format) {
  if (!Object.hasOwn(meshFormats,format)) throw Error('Supported exports: STL, OBJ, PLY and GLB');
  const file=engine.asset(id,format==='glb'?'glb':'stl');
  if (format==='stl'||format==='glb') return fs.createReadStream(file);
  const fd=await fs.promises.open(file,'r');
  try {
    const header=Buffer.alloc(84), stat=await fd.stat(); await fd.read(header,0,84,0);
    const count=header.readUInt32LE(80);
    if (!count||count>4000000||stat.size!==84+count*50) throw Error('Invalid binary STL');
    async function* convert() {
      try {
        yield format==='obj' ? '# Dyanari geometry; units mm; Z up; no materials\n' : `ply\nformat binary_little_endian 1.0\ncomment Dyanari units mm Z up\nelement vertex ${count*3}\nproperty float x\nproperty float y\nproperty float z\nelement face ${count}\nproperty list uchar int vertex_indices\nend_header\n`;
        for(let first=0;first<count;first+=512) {
          const n=Math.min(512,count-first), bytes=Buffer.alloc(n*50);
          const {bytesRead}=await fd.read(bytes,0,bytes.length,84+first*50);if(bytesRead!==bytes.length)throw Error('Mesh changed during export');
          let text='';const vertices=Buffer.alloc(n*36);
          for(let i=0;i<n;i++) {
            const xyz=[];for(let k=0;k<9;k++){const value=bytes.readFloatLE(i*50+12+k*4);if(!Number.isFinite(value))throw Error('Invalid mesh vertex');xyz.push(value);vertices.writeFloatLE(value,i*36+k*4)}
            if(format==='obj'){for(let k=0;k<9;k+=3)text+=`v ${xyz[k]} ${xyz[k+1]} ${xyz[k+2]}\n`;const v=(first+i)*3+1;text+=`f ${v} ${v+1} ${v+2}\n`;}
          }
          yield format==='obj'?text:vertices;
        }
        if(format==='ply')for(let first=0;first<count;first+=1024){const n=Math.min(1024,count-first),faces=Buffer.alloc(n*13);for(let i=0;i<n;i++){faces[i*13]=3;for(let k=0;k<3;k++)faces.writeInt32LE((first+i)*3+k,i*13+1+k*4)}yield faces}
      } finally {await fd.close()}
    }
    const stream=Readable.from(convert());stream.once('close',()=>fd.close().catch(()=>{}));return stream;
  } catch(e){await fd.close();throw e}
}
