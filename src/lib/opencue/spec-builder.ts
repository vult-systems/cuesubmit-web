// OpenCue Job Specification XML Builder

export interface LayerSpec {
  name: string;
  command: string;
  range: string;
  chunk: number;
  cores: number;
  memory: number; // in GB
  services?: string[];
  env?: Record<string, string>;
}

export interface JobSpec {
  name: string;
  show: string;
  shot: string;
  user: string;
  priority?: number;
  maxRetries?: number;
  paused?: boolean;
  layers: LayerSpec[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildJobSpec(spec: JobSpec): string {
  const priority = spec.priority ?? 100;
  const maxRetries = spec.maxRetries ?? 3;
  const paused = spec.paused ?? false;

  const layersXml = spec.layers
    .map((layer) => {
      const servicesXml = layer.services?.length
        ? `<services>${layer.services.map((s) => `<service>${escapeXml(s)}</service>`).join("")}</services>`
        : "<services><service>maya</service></services>";

      const envXml = layer.env
        ? `<env>${Object.entries(layer.env)
            .map(([k, v]) => `<key name="${escapeXml(k)}">${escapeXml(v)}</key>`)
            .join("")}</env>`
        : "";

      // Layer type must be: Render, Util, or Post (capitalized)
      return `<layer name="${escapeXml(layer.name)}" type="Render"><cmd>${escapeXml(layer.command)}</cmd><range>${escapeXml(layer.range)}</range><chunk>${layer.chunk}</chunk><cores>${layer.cores}</cores><memory>${Math.round(layer.memory * 1024 * 1024)}</memory>${envXml}${servicesXml}</layer>`;
    })
    .join("");

  // OpenCue job spec format with DOCTYPE declaration pointing to cuebot's DTD
  // The DOCTYPE URL must start with http://localhost:8080/spcue/dtd/ for cuebot to resolve it
  return `<?xml version="1.0"?><!DOCTYPE spec PUBLIC "SPI Cue Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.12.dtd"><spec><facility>local</facility><show>${escapeXml(spec.show)}</show><shot>${escapeXml(spec.shot)}</shot><user>${escapeXml(spec.user)}</user><job name="${escapeXml(spec.name)}"><paused>${paused}</paused><priority>${priority}</priority><maxretries>${maxRetries}</maxretries><autoeat>false</autoeat><env></env><layers>${layersXml}</layers></job></spec>`;
}

// Common render command templates
export const commandTemplates = {
  blender: (scenePath: string, outputPath: string) =>
    `blender -b "${scenePath}" -o "${outputPath}" -f #IFRAME#`,
  maya: (scenePath: string, outputPath: string, renderer = "arnold") =>
    `Render -r ${renderer} -s #IFRAME# -e #IFRAME# -rd "${outputPath}" "${scenePath}"`,
  houdini: (hipPath: string, ropPath: string) =>
    `hython -c "hou.hipFile.load('${hipPath}'); hou.node('${ropPath}').render(frame_range=(#IFRAME#, #IFRAME#))"`,
  nuke: (scriptPath: string) =>
    `nuke -F #IFRAME#-#IFRAME# -x "${scriptPath}"`,
  custom: (cmd: string) => cmd.replace(/\$FRAME/g, "#IFRAME#"),
};
