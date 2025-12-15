"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RotateCcw, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Department display mappings
const departmentLabels: Record<string, string> = {
  model: "Model",
  lookdev: "Lookdev",
  light: "Light",
  anim: "Anim",
  fx: "FX",
};

// Render type (Output) display mappings
const renderTypeLabels: Record<string, string> = {
  still: "Still",
  turnaround: "Turnaround",
  anim: "Anim",
  preview: "Preview",
  lookdev: "Lookdev",
  playblast: "Playblast",
};

const formSchema = z.object({
  user: z.string().min(1, "Username is required"),
  show: z.string().min(1, "Show is required"),
  // Project Code - 2-6 uppercase letters only
  projectCode: z.string()
    .min(2, "Project code must be 2-6 uppercase letters")
    .max(6, "Project code must be 2-6 uppercase letters")
    .regex(/^[A-Z]+$/, "Only uppercase letters allowed"),
  // Core naming fields
  scope: z.string().min(1, "Scope is required"),
  department: z.string().min(1, "Department is required"),
  subject: z.string().min(1, "Subject is required"),
  renderType: z.string().min(1, "Output type is required"),
  // Rendered frame base name (validated conditionally below)
  renderedFrameName: z.string()
    .regex(/^[A-Za-z0-9_]*$/, "Only letters, numbers, and underscores allowed")
    .optional(),
  // Shot Structure (only used when scope is "shot")
  useAct: z.boolean().optional(),
  useSequence: z.boolean().optional(),
  useScene: z.boolean().optional(),
  useShot: z.boolean().optional(),
  act: z.string().optional(),
  sequence: z.string().optional(),
  scene: z.string().optional(),
  shot: z.string().optional(),
  description: z.string().optional(),
  // Software
  service: z.string().min(1),
  renderer: z.string().min(1),
  version: z.string().min(1),
  // Paths
  projectPath: z.string().optional(),
  sceneFile: z.string().min(1, "Scene file is required"),
  outputPath: z.string().min(1, "Output path is required"),
  renderLayer: z.string().optional(),
  camera: z.string().optional(),
  imageFormat: z.string().min(1),
  // Frames
  frameStart: z.number().min(1),
  frameEnd: z.number().min(1),
  chunk: z.number().min(1),
  // Advanced
  envVars: z.string().optional(),
  customArgs: z.string().optional(),
  pauseOnStart: z.boolean().optional(),
  skipExistingFrames: z.boolean().optional(),
  autoRetry: z.boolean().optional(),
}).refine(
  (data) => {
    // Rendered frame name is required when scope is "shot"
    if (data.scope === "shot") {
      return data.renderedFrameName && data.renderedFrameName.length > 0;
    }
    return true;
  },
  {
    message: "Rendered frame name is required for shots",
    path: ["renderedFrameName"],
  }
);

type FormData = z.infer<typeof formSchema>;

const defaultValues: FormData = {
  user: "",
  show: "",
  projectCode: "",
  scope: "",
  department: "",
  subject: "",
  renderType: "",
  renderedFrameName: "",
  useAct: false,
  useSequence: false,
  useScene: false,
  useShot: false,
  act: "",
  sequence: "",
  scene: "",
  shot: "",
  description: "",
  service: "maya",
  renderer: "arnold",
  version: "2026",
  projectPath: "",
  sceneFile: "",
  outputPath: "",
  renderLayer: "defaultRenderLayer",
  camera: "persp",
  imageFormat: "exr",
  frameStart: 1,
  frameEnd: 100,
  chunk: 10,
  envVars: "",
  customArgs: "",
  pauseOnStart: false,
  skipExistingFrames: true,
  autoRetry: true,
};

// Generate job name from form data
function generateJobName(data: {
  projectCode: string;
  scope: string;
  department: string;
  subject: string;
  renderType: string;
}): string {
  if (!data.projectCode || !data.scope || !data.department || !data.subject || !data.renderType) {
    return "";
  }

  // Context: ProjectCode-Scope-Department (e.g., "DRN-Asset-Model", "DRN-Shot-Anim")
  const scopeLabel = data.scope.charAt(0).toUpperCase() + data.scope.slice(1);
  const deptLabel = departmentLabels[data.department] || data.department;
  const context = `${data.projectCode}-${scopeLabel}-${deptLabel}`;

  // Subject: Human-readable name (already provided)
  const subject = data.subject;

  // Output: Render type
  const output = renderTypeLabels[data.renderType] || data.renderType;

  return `${context} / ${subject} / ${output}`;
}

// Generate rendered frame base name
function generateRenderedFrameName(data: {
  projectCode: string;
  subject: string;
  renderType: string;
}): string {
  if (!data.projectCode || !data.subject || !data.renderType) {
    return "";
  }

  // Sanitize subject: remove spaces, keep only alphanumeric and underscores
  const sanitizedSubject = data.subject.replace(/[^A-Za-z0-9_]/g, "");
  const output = renderTypeLabels[data.renderType] || data.renderType;

  return `${data.projectCode}_${sanitizedSubject}_${output}`;
}

// Generate shot code from shot structure
function generateShotCode(data: {
  useAct?: boolean;
  useSequence?: boolean;
  useScene?: boolean;
  useShot?: boolean;
  act?: string;
  sequence?: string;
  scene?: string;
  shot?: string;
}): string {
  const parts: string[] = [];

  if (data.useAct && data.act) {
    // Convert "act01" to "A01"
    parts.push(data.act.replace("act", "A"));
  }
  if (data.useSequence && data.sequence) {
    // Convert "seq01" to "S01"
    parts.push(data.sequence.replace("seq", "S"));
  }
  if (data.useScene && data.scene) {
    // Convert "sc01" to "SC01"
    parts.push(data.scene.replace("sc", "SC"));
  }
  if (data.useShot && data.shot) {
    // Convert "sh01" to "SH01"
    parts.push(data.shot.replace("sh", "SH"));
  }

  return parts.join("_");
}

// Required field marker component
function Required({ color = "cool" }: { color?: "cool" | "warm" }) {
  const colorClass = color === "cool" ? "text-blue-400" : "text-amber-400";
  return <span className={`${colorClass} ml-0.5`}>*</span>;
}

import { sectionAccents } from "@/lib/accent-colors";
import { GroupedSection } from "@/components/grouped-section";

// Field label component
function FieldLabel({
  children,
  required,
  accent = "cool",
  htmlFor
}: {
  children: React.ReactNode;
  required?: boolean;
  accent?: "cool" | "warm";
  htmlFor?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-text-muted text-[10px] font-medium uppercase tracking-wide">
      {children}
      {required && <Required color={accent} />}
    </Label>
  );
}

interface Show {
  id: string;
  name: string;
  active: boolean;
}

export default function SubmitPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shows, setShows] = useState<Show[]>([]);
  const [manualFrameName, setManualFrameName] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: "onChange",
  });

  // Fetch shows and user session on mount
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch shows
        const showsResponse = await fetch("/api/shows");
        const showsData = await showsResponse.json();
        if (showsResponse.ok) {
          setShows(showsData.shows || []);
        }

        // Fetch user session and autofill username
        const sessionResponse = await fetch("/api/auth/session");
        const sessionData = await sessionResponse.json();
        if (sessionResponse.ok && sessionData.isLoggedIn && sessionData.user?.username) {
          setValue("user", sessionData.user.username);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    }
    fetchData();
  }, [setValue]);

  const frameStart = watch("frameStart");
  const frameEnd = watch("frameEnd");
  const chunk = watch("chunk");
  const projectCode = watch("projectCode");
  const scope = watch("scope");
  const department = watch("department");
  const subject = watch("subject");
  const renderType = watch("renderType");
  const renderedFrameName = watch("renderedFrameName");
  const imageFormat = watch("imageFormat");
  const useAct = watch("useAct");
  const useSequence = watch("useSequence");
  const useScene = watch("useScene");
  const useShot = watch("useShot");
  const act = watch("act");
  const sequence = watch("sequence");
  const scene = watch("scene");
  const shot = watch("shot");

  const frameCount = Math.max(0, frameEnd - frameStart + 1);
  const chunkCount = Math.ceil(frameCount / chunk);

  // Generate job name preview
  const jobNamePreview = generateJobName({ projectCode, scope, department, subject, renderType });

  // Generate rendered frame name preview - always compute fresh
  const autoRenderedFrameName = generateRenderedFrameName({ projectCode, subject, renderType });
  // Use the watched value if manually edited, otherwise use auto-generated
  const finalFrameName = manualFrameName ? renderedFrameName : autoRenderedFrameName;
  const frameOutputPreview = finalFrameName ? `${finalFrameName}._####.${imageFormat}` : "";

  // Auto-generate shot code when shot structure changes
  useEffect(() => {
    if (scope === "shot") {
      const shotCode = generateShotCode({ useAct, useSequence, useScene, useShot, act, sequence, scene, shot });
      if (shotCode) {
        setValue("subject", shotCode);
      }
    }
  }, [scope, useAct, useSequence, useScene, useShot, act, sequence, scene, shot, setValue]);

  // Auto-populate rendered frame name when inputs change
  useEffect(() => {
    const autoName = generateRenderedFrameName({ projectCode, subject, renderType });
    if (autoName && !manualFrameName) {
      setValue("renderedFrameName", autoName);
    }
  }, [projectCode, subject, renderType, manualFrameName, setValue]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      let command = "";
      if (data.service === "maya") {
        command = `Render -r ${data.renderer} -s #IFRAME# -e #IFRAME# -rd "${data.outputPath}" "${data.sceneFile}"`;
      } else if (data.service === "houdini") {
        command = `hython -c "hou.hipFile.load('${data.sceneFile}'); hou.node('/out/mantra1').render(frame_range=(#IFRAME#, #IFRAME#))"`;
      }

      // Generate the 3-part job name
      const jobName = generateJobName({
        projectCode: data.projectCode,
        scope: data.scope,
        department: data.department,
        subject: data.subject,
        renderType: data.renderType,
      });

      // Generate rendered frame name
      const frameBaseName = data.renderedFrameName || generateRenderedFrameName({
        projectCode: data.projectCode,
        subject: data.subject,
        renderType: data.renderType,
      });

      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobName,
          show: data.show,
          shot: data.shot || "default",
          priority: 100,
          maxRetries: 3,
          // Rendered frame naming
          renderedFrameName: frameBaseName,
          frameOutputPattern: `${frameBaseName}._####.${data.imageFormat}`,
          // Include all structured metadata
          metadata: {
            user: data.user,
            projectCode: data.projectCode,
            scope: data.scope,
            department: data.department,
            subject: data.subject,
            renderType: data.renderType,
            act: data.act,
            sequence: data.sequence,
            scene: data.scene,
            shotCode: data.shot,
          },
          layers: [
            {
              name: data.renderLayer || "render",
              command,
              frameRange: `${data.frameStart}-${data.frameEnd}`,
              chunk: data.chunk,
              cores: 1,
              memoryGb: 8,
            },
          ],
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast.success(result.message || "Job submitted successfully!");
        router.push("/jobs");
      } else {
        toast.error(result.error || "Failed to submit job");
      }
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("Failed to connect to server");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get subject placeholder based on scope
  const getSubjectPlaceholder = () => {
    switch (scope) {
      case "asset": return "e.g., hero_sword";
      case "shot": return "Auto-generated";
      case "test": return "e.g., fire_sim_v02";
      default: return "e.g., subject_name";
    }
  };

  return (
    <div className="pb-24">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Submit Job</h1>
            <p className="text-text-muted text-xs mt-1">
              {frameCount} frames • {chunkCount} tasks
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              reset(defaultValues);
              setManualFrameName(false);
            }}
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5 hover:border-neutral-300 dark:hover:border-white/12 transition-all duration-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Job Information Card */}
        <GroupedSection
          title="Job Information"
          badge="Metadata"
          accentColors={sectionAccents.cool}
          contentClassName="p-4"
          rightContent={
            jobNamePreview && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">Job Name:</span>
                <code className="text-xs font-mono text-text-secondary bg-neutral-100 dark:bg-neutral-950/60 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/8">
                  {jobNamePreview}
                </code>
              </div>
            )
          }
        >
          <div className="space-y-3">
            {/* Username, Show & Project Code */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="cool">Username</FieldLabel>
                <Input
                  {...register("user")}
                  placeholder="e.g., jsmith"
                  
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="cool">Show</FieldLabel>
                <Select onValueChange={(value) => setValue("show", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose show" />
                  </SelectTrigger>
                  <SelectContent>
                    {shows.map((show) => (
                      <SelectItem key={show.id} value={show.name}>{show.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="cool">Project Code</FieldLabel>
                <Input
                  {...register("projectCode")}
                  placeholder="e.g., PROJ"
                  maxLength={6}
                  className="uppercase font-mono tracking-wider"
                  onChange={(e) => {
                    // Force uppercase
                    const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                    setValue("projectCode", value);
                  }}
                />
              </div>
            </div>

            {/* Scope, Department, Subject, Output */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-1 space-y-1">
                <FieldLabel required accent="cool">Scope</FieldLabel>
                <Select onValueChange={(value) => {
                  setValue("scope", value);
                  // Clear subject when scope changes
                  if (value !== "shot") {
                    setValue("subject", "");
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="shot">Shot</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 space-y-1">
                <FieldLabel required accent="cool">Department</FieldLabel>
                <Select onValueChange={(value) => setValue("department", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="model">Model</SelectItem>
                    <SelectItem value="lookdev">Lookdev</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="anim">Anim</SelectItem>
                    <SelectItem value="fx">FX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="cool">Subject</FieldLabel>
                <Input
                  {...register("subject")}
                  placeholder={getSubjectPlaceholder()}
                  disabled={scope === "shot"}
                  className={scope === "shot" ? "opacity-60" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="cool">Output</FieldLabel>
                <Select onValueChange={(value) => setValue("renderType", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose output" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="still">Still</SelectItem>
                    <SelectItem value="turnaround">Turnaround</SelectItem>
                    <SelectItem value="anim">Anim</SelectItem>
                    <SelectItem value="preview">Preview</SelectItem>
                    <SelectItem value="lookdev">Lookdev</SelectItem>
                    <SelectItem value="playblast">Playblast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Shot Structure (only visible when scope is "shot") */}
            {scope === "shot" && (
              <div className="grid grid-cols-4 gap-3 pt-2 border-t border-neutral-200 dark:border-white/6">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useAct"
                      checked={useAct}
                      onCheckedChange={(checked) => setValue("useAct", !!checked)}
                      className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                    <FieldLabel htmlFor="useAct">Act</FieldLabel>
                  </div>
                  <Select disabled={!useAct} onValueChange={(value) => setValue("act", value)}>
                    <SelectTrigger className="disabled:opacity-40">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {["act01", "act02", "act03", "act04", "act05"].map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useSequence"
                      checked={useSequence}
                      onCheckedChange={(checked) => setValue("useSequence", !!checked)}
                      className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                    <FieldLabel htmlFor="useSequence">Sequence</FieldLabel>
                  </div>
                  <Select disabled={!useSequence} onValueChange={(value) => setValue("sequence", value)}>
                    <SelectTrigger className="disabled:opacity-40">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48">
                      {Array.from({ length: 50 }, (_, i) => `seq${String(i + 1).padStart(2, '0')}`).map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useScene"
                      checked={useScene}
                      onCheckedChange={(checked) => setValue("useScene", !!checked)}
                      className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                    <FieldLabel htmlFor="useScene">Scene</FieldLabel>
                  </div>
                  <Select disabled={!useScene} onValueChange={(value) => setValue("scene", value)}>
                    <SelectTrigger className="disabled:opacity-40">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48">
                      {Array.from({ length: 50 }, (_, i) => `sc${String(i + 1).padStart(2, '0')}`).map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useShot"
                      checked={useShot}
                      onCheckedChange={(checked) => setValue("useShot", !!checked)}
                      className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                    <FieldLabel htmlFor="useShot">Shot</FieldLabel>
                  </div>
                  <Select disabled={!useShot} onValueChange={(value) => setValue("shot", value)}>
                    <SelectTrigger className="disabled:opacity-40">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48">
                      {Array.from({ length: 50 }, (_, i) => `sh${String(i + 1).padStart(2, '0')}`).map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <FieldLabel accent="cool">Description</FieldLabel>
              <Input
                {...register("description")}
                placeholder="e.g., Final lighting pass for hero shot"
                
              />
            </div>
          </div>
        </GroupedSection>

        {/* Render Settings Card */}
        <GroupedSection title="Render Settings" badge="Render" accentColors={sectionAccents.warm} contentClassName="p-4">
          <div className="space-y-3">
            {/* Software, Renderer, Version */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Software</FieldLabel>
                <Select defaultValue="maya" onValueChange={(value) => setValue("service", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maya">Maya</SelectItem>
                    <SelectItem value="houdini">Houdini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Renderer</FieldLabel>
                <Select defaultValue="arnold" onValueChange={(value) => setValue("renderer", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arnold">Arnold</SelectItem>
                    <SelectItem value="renderman">RenderMan</SelectItem>
                    <SelectItem value="vray">V-Ray</SelectItem>
                    <SelectItem value="playblast">Playblast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Version</FieldLabel>
                <Select defaultValue="2026" onValueChange={(value) => setValue("version", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Frame Range */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Start Frame</FieldLabel>
                <Input
                  type="number"
                  {...register("frameStart", { valueAsNumber: true })}
                  
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">End Frame</FieldLabel>
                <Input
                  type="number"
                  {...register("frameEnd", { valueAsNumber: true })}
                  
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Chunk Size</FieldLabel>
                <Input
                  type="number"
                  {...register("chunk", { valueAsNumber: true })}
                  min={1}
                  
                />
              </div>
            </div>

            {/* Paths */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3 space-y-1">
                <FieldLabel required accent="warm">Scene File</FieldLabel>
                <Input
                  {...register("sceneFile")}
                  placeholder="e.g., /shows/proj/shots/sc01/lighting_v001.ma"
                  className="font-mono"
                />
              </div>
              <div className="col-span-3 space-y-1">
                <FieldLabel required accent="warm">Output Directory</FieldLabel>
                <Input
                  {...register("outputPath")}
                  placeholder="e.g., /shows/proj/renders/sc01/"
                  className="font-mono"
                />
              </div>
            </div>

            {/* Layer, Camera, Format */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <FieldLabel accent="warm">Render Layer</FieldLabel>
                <Input
                  {...register("renderLayer")}
                  placeholder="e.g., masterLayer"
                  
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel accent="warm">Camera</FieldLabel>
                <Input
                  {...register("camera")}
                  placeholder="e.g., shotCam"
                  
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Format</FieldLabel>
                <Select defaultValue="exr" onValueChange={(value) => setValue("imageFormat", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exr">EXR</SelectItem>
                    <SelectItem value="tiff">TIFF</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpg">JPEG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rendered Frame Name */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3 space-y-1">
                <FieldLabel required={scope === "shot"} accent="warm">
                  Rendered Frame Name
                </FieldLabel>
                <Input
                  value={manualFrameName ? renderedFrameName : autoRenderedFrameName}
                  placeholder="e.g., PROJ_hero_beauty"
                  className="font-mono"
                  onChange={(e) => {
                    // Only allow letters, numbers, underscores
                    const value = e.target.value.replace(/[^A-Za-z0-9_]/g, "");
                    setValue("renderedFrameName", value);
                    // Mark as manually edited once user starts typing
                    setManualFrameName(true);
                  }}
                  onFocus={() => {
                    // When user focuses, copy auto value to form if not manually edited
                    if (!manualFrameName && autoRenderedFrameName) {
                      setValue("renderedFrameName", autoRenderedFrameName);
                    }
                  }}
                />
              </div>
              <div className="col-span-3 space-y-1">
                <FieldLabel accent="warm">Output Preview</FieldLabel>
                <div className="h-8 px-2.5 flex items-center bg-white dark:bg-white/3 border border-neutral-200 dark:border-white/8 rounded-lg">
                  {frameOutputPreview ? (
                    <code className="text-xs font-mono text-amber-600 dark:text-amber-400">
                      {frameOutputPreview}
                    </code>
                  ) : (
                    <span className="text-xs text-text-muted">Fill in fields above...</span>
                  )}
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    id="pauseOnStart"
                    onCheckedChange={(checked) => setValue("pauseOnStart", !!checked)}
                    className="h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <span className="text-xs text-text-muted group-hover:text-text-primary transition-colors">Pause on start</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    id="skipExistingFrames"
                    defaultChecked
                    onCheckedChange={(checked) => setValue("skipExistingFrames", !!checked)}
                    className="h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <span className="text-xs text-text-muted group-hover:text-text-primary transition-colors">Skip existing frames</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    id="autoRetry"
                    defaultChecked
                    onCheckedChange={(checked) => setValue("autoRetry", !!checked)}
                    className="h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <span className="text-xs text-text-muted group-hover:text-text-primary transition-colors">Auto-retry failed frames</span>
                </label>
              </div>
            </div>
          </div>
        </GroupedSection>
      </form>

      {/* Sticky Submit Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        {/* Top fade gradient */}
        <div className="absolute top-0 left-0 right-0 h-8 -mt-8 bg-linear-to-t from-white/80 to-transparent dark:from-neutral-950/80 dark:to-transparent pointer-events-none" />
        {/* Background with blur */}
        <div className="absolute inset-0 bg-white/80 dark:bg-black/20 backdrop-blur-2xl" />
        <div className="relative max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs text-text-secondary">
              <span className="text-text-primary font-medium">{frameCount}</span> frames • <span className="text-text-primary font-medium">{chunkCount}</span> tasks
            </div>
            {jobNamePreview && (
              <div className="text-xs text-text-muted border-l border-neutral-200 dark:border-white/10 pl-4">
                <span className="text-text-secondary">{jobNamePreview}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isValid && (
              <span className="text-xs text-amber-400/80">Missing required fields</span>
            )}
            <Button
              type="submit"
              form="submit-form"
              disabled={isSubmitting || !isValid}
              onClick={handleSubmit(onSubmit)}
              className="gap-2 h-9 px-5 bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-white/90 dark:text-black text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-white/10 hover:-translate-y-0.5 transition-all duration-300 btn-shine disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Job
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
