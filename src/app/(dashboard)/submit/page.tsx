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
  className: z.string().min(1, "Class is required"),
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
  className: "",
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
  const colorClass = color === "cool" ? "text-section-cool-muted" : "text-section-warm-muted";
  return <span className={`${colorClass} ml-0.5`}>*</span>;
}

// Section card component
function SectionCard({
  title,
  pill,
  accent,
  children,
  rightContent,
}: {
  title: string;
  pill: string;
  accent: "cool" | "warm";
  children: React.ReactNode;
  rightContent?: React.ReactNode;
}) {
  const accentStyles = accent === "cool"
    ? "border-l-section-cool"
    : "border-l-section-warm";
  const pillStyles = accent === "cool"
    ? "bg-section-cool-bg text-section-cool border-section-cool-border"
    : "bg-section-warm-bg text-section-warm border-section-warm-border";

  return (
    <div className={`rounded-lg border border-border bg-surface overflow-hidden border-l-[3px] ${accentStyles}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-medium text-text-primary">{title}</h2>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${pillStyles}`}>
            {pill}
          </span>
        </div>
        {rightContent}
      </div>
      {/* Section Content */}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

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
    <Label htmlFor={htmlFor} className="text-text-secondary text-[11px] font-medium uppercase tracking-wide">
      {children}
      {required && <Required color={accent} />}
    </Label>
  );
}

// Helper text component
function HelperText({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-text-muted mt-1">{children}</p>;
}

export default function SubmitPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Generate rendered frame name preview
  const autoRenderedFrameName = generateRenderedFrameName({ projectCode, subject, renderType });
  const finalFrameName = renderedFrameName || autoRenderedFrameName;
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
    if (autoName && !renderedFrameName) {
      setValue("renderedFrameName", autoName);
    }
  }, [projectCode, subject, renderType, renderedFrameName, setValue]);

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
          show: data.className,
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

  // Input styling with focus accents (using semantic tokens)
  // Inputs use section colors for contextual focus
  const inputBase = "bg-surface-muted border-border text-text-primary h-8 text-sm transition-all placeholder:text-text-muted hover:border-text-muted/50 focus:border-section-cool focus:ring-1 focus:ring-section-cool/30";
  const inputBaseWarm = "bg-surface-muted border-border text-text-primary h-8 text-sm transition-all placeholder:text-text-muted hover:border-text-muted/50 focus:border-section-warm focus:ring-1 focus:ring-section-warm/30";
  // Pre-configured dropdowns use PRIMARY accent (cardinal red) for focus rings
  const selectTriggerBase = "bg-surface-muted border-border text-text-primary h-8 text-sm transition-all hover:border-text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30 data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/30";
  const selectTriggerWarm = "bg-surface-muted border-border text-text-primary h-8 text-sm transition-all hover:border-text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30 data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/30";

  // Get subject placeholder based on scope
  const getSubjectPlaceholder = () => {
    switch (scope) {
      case "asset": return "e.g., Sword, Dragon, TreeA";
      case "shot": return "Auto-generated from shot structure";
      case "test": return "e.g., RunCycle, FireSim";
      default: return "Enter subject name";
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-text-primary">Submit Job</h1>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span><span className="text-text-secondary font-medium">{frameCount}</span> frames</span>
              <span className="text-border">•</span>
              <span><span className="text-text-secondary font-medium">{chunkCount}</span> tasks</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isValid && (
              <span className="text-xs text-warning mr-2">Missing required fields</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => reset(defaultValues)}
              className="text-text-secondary hover:text-text-primary h-8 px-3"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !isValid}
              size="sm"
              className="bg-accent hover:bg-accent-muted text-white h-8 px-4"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Submit
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Job Information Card */}
        <SectionCard
          title="Job Information"
          pill="Metadata"
          accent="cool"
          rightContent={
            jobNamePreview && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">Job Name:</span>
                <code className="text-xs font-mono text-section-cool bg-section-cool-bg px-2 py-0.5 rounded border border-section-cool-border">
                  {jobNamePreview}
                </code>
              </div>
            )
          }
        >
          <div className="space-y-4">
            {/* Username, Class & Project Code */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="cool">Username</FieldLabel>
                <Input
                  {...register("user")}
                  placeholder="Enter username"
                  className={inputBase}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="cool">Class</FieldLabel>
                <Select onValueChange={(value) => setValue("className", value)}>
                  <SelectTrigger className={selectTriggerBase}>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="4140_SrThesisWkshp">4140_SrThesisWkshp</SelectItem>
                    <SelectItem value="4440_SrThesisProdI">4440_SrThesisProdI</SelectItem>
                    <SelectItem value="4450_SrThesisProdII">4450_SrThesisProdII</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="cool">Project Code</FieldLabel>
                <Input
                  {...register("projectCode")}
                  placeholder="e.g., DRN"
                  maxLength={6}
                  className={`${inputBase} uppercase font-mono tracking-wider`}
                  onChange={(e) => {
                    // Force uppercase
                    const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                    setValue("projectCode", value);
                  }}
                />
                <HelperText>2-6 uppercase letters</HelperText>
              </div>
            </div>

            {/* Scope, Department, Subject, Output */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-1 space-y-1.5">
                <FieldLabel required accent="cool">Scope</FieldLabel>
                <Select onValueChange={(value) => {
                  setValue("scope", value);
                  // Clear subject when scope changes
                  if (value !== "shot") {
                    setValue("subject", "");
                  }
                }}>
                  <SelectTrigger className={selectTriggerBase}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="shot">Shot</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 space-y-1.5">
                <FieldLabel required accent="cool">Department</FieldLabel>
                <Select onValueChange={(value) => setValue("department", value)}>
                  <SelectTrigger className={selectTriggerBase}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="model">Model</SelectItem>
                    <SelectItem value="lookdev">Lookdev</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="anim">Anim</SelectItem>
                    <SelectItem value="fx">FX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="cool">Subject</FieldLabel>
                <Input
                  {...register("subject")}
                  placeholder={getSubjectPlaceholder()}
                  disabled={scope === "shot"}
                  className={`${inputBase} ${scope === "shot" ? "opacity-60" : ""}`}
                />
                <HelperText>
                  {scope === "shot" ? "Built from shot structure below" : "Asset name, shot code, or test name"}
                </HelperText>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="cool">Output</FieldLabel>
                <Select onValueChange={(value) => setValue("renderType", value)}>
                  <SelectTrigger className={selectTriggerBase}>
                    <SelectValue placeholder="Select output type" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
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
              <div className="grid grid-cols-4 gap-4 pt-2 border-t border-border">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useAct"
                      checked={useAct}
                      onCheckedChange={(checked) => setValue("useAct", !!checked)}
                      className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-cool data-[state=checked]:border-section-cool"
                    />
                    <FieldLabel htmlFor="useAct">Act</FieldLabel>
                  </div>
                  <Select disabled={!useAct} onValueChange={(value) => setValue("act", value)}>
                    <SelectTrigger className={`${selectTriggerBase} disabled:opacity-40`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-raised border-border">
                      {["act01", "act02", "act03", "act04", "act05"].map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useSequence"
                      checked={useSequence}
                      onCheckedChange={(checked) => setValue("useSequence", !!checked)}
                      className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-cool data-[state=checked]:border-section-cool"
                    />
                    <FieldLabel htmlFor="useSequence">Sequence</FieldLabel>
                  </div>
                  <Select disabled={!useSequence} onValueChange={(value) => setValue("sequence", value)}>
                    <SelectTrigger className={`${selectTriggerBase} disabled:opacity-40`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-raised border-border max-h-48">
                      {Array.from({ length: 50 }, (_, i) => `seq${String(i + 1).padStart(2, '0')}`).map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useScene"
                      checked={useScene}
                      onCheckedChange={(checked) => setValue("useScene", !!checked)}
                      className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-cool data-[state=checked]:border-section-cool"
                    />
                    <FieldLabel htmlFor="useScene">Scene</FieldLabel>
                  </div>
                  <Select disabled={!useScene} onValueChange={(value) => setValue("scene", value)}>
                    <SelectTrigger className={`${selectTriggerBase} disabled:opacity-40`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-raised border-border max-h-48">
                      {Array.from({ length: 50 }, (_, i) => `sc${String(i + 1).padStart(2, '0')}`).map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="useShot"
                      checked={useShot}
                      onCheckedChange={(checked) => setValue("useShot", !!checked)}
                      className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-cool data-[state=checked]:border-section-cool"
                    />
                    <FieldLabel htmlFor="useShot">Shot</FieldLabel>
                  </div>
                  <Select disabled={!useShot} onValueChange={(value) => setValue("shot", value)}>
                    <SelectTrigger className={`${selectTriggerBase} disabled:opacity-40`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-raised border-border max-h-48">
                      {Array.from({ length: 50 }, (_, i) => `sh${String(i + 1).padStart(2, '0')}`).map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <FieldLabel accent="cool">Description</FieldLabel>
              <Input
                {...register("description")}
                placeholder="Brief description of this render job..."
                className={inputBase}
              />
            </div>
          </div>
        </SectionCard>

        {/* Render Settings Card */}
        <SectionCard title="Render Settings" pill="Render" accent="warm">
          <div className="space-y-4">
            {/* Software, Renderer, Version */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">Software</FieldLabel>
                <Select defaultValue="maya" onValueChange={(value) => setValue("service", value)}>
                  <SelectTrigger className={selectTriggerWarm}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="maya">Maya</SelectItem>
                    <SelectItem value="houdini">Houdini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">Renderer</FieldLabel>
                <Select defaultValue="arnold" onValueChange={(value) => setValue("renderer", value)}>
                  <SelectTrigger className={selectTriggerWarm}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="arnold">Arnold</SelectItem>
                    <SelectItem value="renderman">RenderMan</SelectItem>
                    <SelectItem value="vray">V-Ray</SelectItem>
                    <SelectItem value="playblast">Playblast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">Version</FieldLabel>
                <Select defaultValue="2026" onValueChange={(value) => setValue("version", value)}>
                  <SelectTrigger className={selectTriggerWarm}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Frame Range */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">Start Frame</FieldLabel>
                <Input
                  type="number"
                  {...register("frameStart", { valueAsNumber: true })}
                  className={inputBaseWarm}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">End Frame</FieldLabel>
                <Input
                  type="number"
                  {...register("frameEnd", { valueAsNumber: true })}
                  className={inputBaseWarm}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">Chunk Size</FieldLabel>
                <Input
                  type="number"
                  {...register("chunk", { valueAsNumber: true })}
                  min={1}
                  className={inputBaseWarm}
                />
                <HelperText>Frames per task</HelperText>
              </div>
            </div>

            {/* Paths */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3 space-y-1.5">
                <FieldLabel required accent="warm">Scene File</FieldLabel>
                <Input
                  {...register("sceneFile")}
                  placeholder="/path/to/scene.ma"
                  className={`${inputBaseWarm} font-mono text-xs`}
                />
                <HelperText>Full path to Maya/Houdini scene</HelperText>
              </div>
              <div className="col-span-3 space-y-1.5">
                <FieldLabel required accent="warm">Output Directory</FieldLabel>
                <Input
                  {...register("outputPath")}
                  placeholder="/path/to/output/"
                  className={`${inputBaseWarm} font-mono text-xs`}
                />
                <HelperText>Where rendered frames will be saved</HelperText>
              </div>
            </div>

            {/* Layer, Camera, Format */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-2 space-y-1.5">
                <FieldLabel accent="warm">Render Layer</FieldLabel>
                <Input
                  {...register("renderLayer")}
                  placeholder="defaultRenderLayer"
                  className={inputBaseWarm}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel accent="warm">Camera</FieldLabel>
                <Input
                  {...register("camera")}
                  placeholder="renderCam"
                  className={inputBaseWarm}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <FieldLabel required accent="warm">Format</FieldLabel>
                <Select defaultValue="exr" onValueChange={(value) => setValue("imageFormat", value)}>
                  <SelectTrigger className={selectTriggerWarm}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-raised border-border">
                    <SelectItem value="exr">EXR</SelectItem>
                    <SelectItem value="tiff">TIFF</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpg">JPEG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Rendered Frame Name */}
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-3 space-y-1.5">
                <FieldLabel required={scope === "shot"} accent="warm">
                  Rendered Frame Name
                </FieldLabel>
                <Input
                  {...register("renderedFrameName")}
                  placeholder={autoRenderedFrameName || "e.g., DRN_Sword_Still"}
                  className={`${inputBaseWarm} font-mono`}
                  onChange={(e) => {
                    // Only allow letters, numbers, underscores
                    const value = e.target.value.replace(/[^A-Za-z0-9_]/g, "");
                    setValue("renderedFrameName", value);
                  }}
                />
                <HelperText>
                  {scope === "shot" ? "Required for shots" : "Auto-generated, editable"}
                </HelperText>
              </div>
              <div className="col-span-3 space-y-1.5">
                <FieldLabel accent="warm">Output Preview</FieldLabel>
                <div className="h-8 px-3 flex items-center bg-surface-muted border border-border rounded-md">
                  {frameOutputPreview ? (
                    <code className="text-xs font-mono text-section-warm">
                      {frameOutputPreview}
                    </code>
                  ) : (
                    <span className="text-xs text-text-muted">Fill in fields above...</span>
                  )}
                </div>
                <HelperText>Final output filename pattern</HelperText>
              </div>
            </div>

            {/* Options */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    id="pauseOnStart"
                    onCheckedChange={(checked) => setValue("pauseOnStart", !!checked)}
                    className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-warm data-[state=checked]:border-section-warm"
                  />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">Pause on start</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    id="skipExistingFrames"
                    defaultChecked
                    onCheckedChange={(checked) => setValue("skipExistingFrames", !!checked)}
                    className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-warm data-[state=checked]:border-section-warm"
                  />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">Skip existing frames</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    id="autoRetry"
                    defaultChecked
                    onCheckedChange={(checked) => setValue("autoRetry", !!checked)}
                    className="border-border h-3.5 w-3.5 data-[state=checked]:bg-section-warm data-[state=checked]:border-section-warm"
                  />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">Auto-retry failed frames</span>
                </label>
              </div>
            </div>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
