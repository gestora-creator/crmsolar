require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: baseRows, error } = await supabase.from("base").select("*");
  if (error) {
    console.error(error);
    return;
  }
  
  let semDados = 0;
  let semDadosBenef = 0;
  let semDadosGerad = 0;
  
  baseRows.forEach(row => {
    const tipoRaw = (row.Tipo || row.tipo || '').toString().toLowerCase().trim()
    const tipo = (tipoRaw === 'geradora' || tipoRaw === 'gerador') ? 'geradora' : 'beneficiaria'
    
    let isSemDados = false;
    
    // Simplificada getInjetadoInfoFromDadosExtraidos:
    let parsed = null;
    try {
       const text = row.dados_extraidos;
       if (text) {
          const match = text.match(/```json\n([\s\S]*?)\n```/);
          parsed = JSON.parse(match ? match[1] : text);
       }
    } catch(e) {}
    
    if (!parsed) {
       isSemDados = true;
    } else {
       // Search for injetado
       let foundInjetado = false;
       for (const k of Object.keys(parsed)) {
          if (k.includes('injetado') && parsed[k] !== null && parsed[k] !== undefined) foundInjetado = true;
       }
       if (parsed.leitura_medidor) {
          for (const k of Object.keys(parsed.leitura_medidor)) {
             if (k.includes('injetado') && parsed.leitura_medidor[k] !== null && parsed.leitura_medidor[k] !== undefined) foundInjetado = true;
          }
       }
       if (!foundInjetado) {
          isSemDados = true;
       }
    }
    
    if (isSemDados) {
       semDados++;
       if (tipo === 'beneficiaria') semDadosBenef++;
       else semDadosGerad++;
    }
  });
  
  console.log(`Total: ${baseRows.length}`);
  console.log(`Sem Dados: ${semDados} (Geradoras: ${semDadosGerad}, Beneficiarias: ${semDadosBenef})`);
}
run();
