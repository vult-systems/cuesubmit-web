"use client";

import { useState, useEffect, useCallback } from "react";
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
import { RotateCcw, Loader2, Send, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InlineFileBrowser, PathShortcuts, SCENE_SHORTCUTS, OUTPUT_SHORTCUTS, ROOT_PATHS } from "@/components/inline-file-browser";

const STORAGE_KEY = "cuesubmit-form-state";
const UI_STATE_KEY = "cuesubmit-ui-state";

// Maya format flag values for the -of CLI option
const mayaFormatFlags: Record<string, string> = {
  png: "png",
  exr: "exr",
  tiff: "tif",
  jpg: "jpeg",
};

const formSchema = z.object({
  user: z.string().min(1, "Username is required"),
  show: z.string().min(1, "Show is required"),
  // Shot Structure
  useAct: z.boolean().optional(),
  useSequence: z.boolean().optional(),
  useScene: z.boolean().optional(),
  useShot: z.boolean().optional(),
  act: z.string().optional(),
  sequence: z.string().optional(),
  scene: z.string().optional(),
  shot: z.string().optional(),
  // Software
  service: z.string().min(1),
  renderer: z.string().min(1),
  version: z.string().min(1),
  // Paths
  projectPath: z.string().optional(),
  sceneFile: z.string().min(1, "Scene file is required"),
  outputPath: z.string().min(1, "Output path is required"),
  // Optional render overrides
  useRenderLayer: z.boolean().optional(),
  renderLayer: z.string().optional(),
  useCamera: z.boolean().optional(),
  camera: z.string().optional(),
  useFormat: z.boolean().optional(),
  imageFormat: z.string().optional(),
  useResolution: z.boolean().optional(),
  resWidth: z.number().min(1).optional(),
  resHeight: z.number().min(1).optional(),
  // Frames
  frameStart: z.number().min(1),
  frameEnd: z.number().min(1),
  frameStep: z.number().min(1).optional(),
  // Tags
  tags: z.string().optional(),
  // Advanced
  envVars: z.string().optional(),
  customArgs: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const defaultValues: FormData = {
  user: "",
  show: "",
  useAct: false,
  useSequence: false,
  useScene: false,
  useShot: false,
  act: "",
  sequence: "",
  scene: "",
  shot: "",
  service: "maya",
  renderer: "arnold",
  version: "2026",
  projectPath: "",
  sceneFile: "",
  outputPath: "",
  useRenderLayer: false,
  renderLayer: "",
  useCamera: false,
  camera: "",
  useFormat: false,
  imageFormat: "png",
  useResolution: false,
  resWidth: 1920,
  resHeight: 1080,
  frameStart: 1,
  frameEnd: 100,
  frameStep: 1,
  tags: "general",
  envVars: "",
  customArgs: "",
};

// Extract scene file base name (without extension) from a full path
// e.g., "\\<server>\RenderOutputRepo\project\heroSword_v02.ma" -> "heroSword_v02"
function extractSceneName(sceneFilePath: string): string {
  if (!sceneFilePath) return "";
  // Get filename from path (handle both / and \)
  const fileName = sceneFilePath.split(/[\\/]/).pop() || "";
  // Remove extension
  return fileName.replace(/\.[^.]+$/, "").replaceAll(/\W/g, "_");
}

// Generate job name from form data
// OpenCue displays as: show-shot-user_JOBNAME
// So we only need the scene file name — show, user, and shot are added by cuebot
function generateJobName(data: {
  sceneFile: string;
}): string {
  const sceneName = extractSceneName(data.sceneFile);
  return sceneName || "job";
}

// Required field marker component
function Required({ color = "cool" }: Readonly<{ color?: "cool" | "warm" }>) {
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
}: Readonly<{
  children: React.ReactNode;
  required?: boolean;
  accent?: "cool" | "warm";
  htmlFor?: string;
}>) {
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

  // Load persisted UI state (browser open/closed, start paths)
  const savedUi = typeof window !== "undefined" ? (() => {
    try { return JSON.parse(sessionStorage.getItem(UI_STATE_KEY) || "{}"); }
    catch { return {}; }
  })() : {};

  const [sceneFileBrowserOpen, setSceneFileBrowserOpen] = useState<boolean>(savedUi.sceneOpen ?? false);
  const [outputPathBrowserOpen, setOutputPathBrowserOpen] = useState<boolean>(savedUi.outputOpen ?? false);
  const [sceneStartPath, setSceneStartPath] = useState<string>(savedUi.sceneStartPath ?? "");
  const [outputStartPath, setOutputStartPath] = useState<string>(savedUi.outputStartPath ?? "");

  // Load saved form state from sessionStorage
  const getSavedValues = useCallback((): FormData => {
    if (typeof window === "undefined") return defaultValues;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FormData>;
        return { ...defaultValues, ...parsed };
      }
    } catch { /* ignore parse errors */ }
    return defaultValues;
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isValid },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getSavedValues(),
    mode: "onChange",
  });

  // Persist form state to sessionStorage on every change
  useEffect(() => {
    const subscription = watch((values) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      } catch { /* ignore quota errors */ }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Persist browser UI state whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({
        sceneOpen: sceneFileBrowserOpen,
        outputOpen: outputPathBrowserOpen,
        sceneStartPath,
        outputStartPath,
      }));
    } catch { /* ignore */ }
  }, [sceneFileBrowserOpen, outputPathBrowserOpen, sceneStartPath, outputStartPath]);

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
          setValue("user", sessionData.user.username, { shouldValidate: true });
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    }
    fetchData();
  }, [setValue]);

  const frameStart = watch("frameStart");
  const frameEnd = watch("frameEnd");
  const frameStep = watch("frameStep") || 1;
  const show = watch("show");
  const sceneFile = watch("sceneFile");
  const useFormat = watch("useFormat");
  const imageFormat = watch("imageFormat") || "png";
  const useAct = watch("useAct");
  const useShot = watch("useShot");
  const act = watch("act");
  const shot = watch("shot");
  const useRenderLayer = watch("useRenderLayer");
  const useCamera = watch("useCamera");
  const useResolution = watch("useResolution");
  const service = watch("service");
  const renderer = watch("renderer");
  const version = watch("version");

  const frameCount = Math.max(0, Math.ceil((frameEnd - frameStart + 1) / frameStep));
  const chunkCount = frameCount; // 1 frame per task (no chunk)

  // Generate job name preview
  const jobNamePreview = generateJobName({ sceneFile });



  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      let command = "";
      const step = data.frameStep && data.frameStep > 1 ? data.frameStep : 0;
      if (data.service === "maya") {
        // Build Maya Render CLI command matching CueSubmit.py
        command = `Render -r ${data.renderer} -s #IFRAME# -e #IFRAME#`;
        // Resolution override
        if (data.useResolution && data.resWidth && data.resHeight) {
          command += ` -x ${data.resWidth} -y ${data.resHeight}`;
          // Arnold needs explicit device aspect ratio to avoid skewing
          if (data.renderer === "arnold") {
            const aspectRatio = (data.resWidth / data.resHeight).toFixed(6);
            command += ` -ard ${aspectRatio}`;
          }
        }
        // Image format override
        if (data.useFormat && data.imageFormat) {
          const flag = mayaFormatFlags[data.imageFormat] || data.imageFormat;
          command += ` -of ${flag}`;
        }
        // Output directory
        command += ` -rd "${data.outputPath}"`;
        // Render layer override
        if (data.useRenderLayer && data.renderLayer) {
          command += ` -rl ${data.renderLayer}`;
        }
        // Camera override
        if (data.useCamera && data.camera) {
          command += ` -cam ${data.camera}`;
        }
        // Scene file (always last)
        command += ` "${data.sceneFile}"`;
      } else if (data.service === "houdini") {
        command = `hython -c "hou.hipFile.load('${data.sceneFile}'); hou.node('/out/mantra1').render(frame_range=(#IFRAME#, #IFRAME#))"`;
      }

      // Generate job name
      const jobName = generateJobName({
        sceneFile: data.sceneFile,
      });

      // Build frame range string with step (e.g., "1-100x2" for every 2nd frame)
      const frameRangeStr = step > 1
        ? `${data.frameStart}-${data.frameEnd}x${step}`
        : `${data.frameStart}-${data.frameEnd}`;

      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobName,
          show: data.show,
          shot: data.shot || "default",
          priority: 100,
          maxRetries: 3,
          // Include structured metadata
          metadata: {
            user: data.user,
            act: data.act,
            sequence: data.sequence,
            scene: data.scene,
            shotCode: data.shot,
          },
          layers: [
            {
              name: (data.useRenderLayer && data.renderLayer) ? data.renderLayer : "render",
              command,
              frameRange: frameRangeStr,
              chunk: 1,
              cores: 1,
              memoryGb: 8,
              tags: data.tags || undefined,
            },
          ],
        }),
      });

      const result = await response.json();
      if (response.ok) {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(UI_STATE_KEY);
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

  return (
    <div className="pb-24">
      <form id="submit-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              sessionStorage.removeItem(STORAGE_KEY);
              sessionStorage.removeItem(UI_STATE_KEY);
              reset(defaultValues);
              setSceneFileBrowserOpen(false);
              setOutputPathBrowserOpen(false);
              setSceneStartPath("");
              setOutputStartPath("");
            }}
            className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5 hover:border-neutral-300 dark:hover:border-white/12 transition-all duration-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Job Settings */}
        <GroupedSection
          title="Job Settings"
          badge="Submit"
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
            {/* Username & Show */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3 space-y-1">
                <FieldLabel required accent="cool">Username</FieldLabel>
                <Input
                  {...register("user")}
                  placeholder="e.g., jsmith"
                  
                />
              </div>
              <div className="col-span-3 space-y-1">
                <FieldLabel required accent="cool">Show</FieldLabel>
                <Select value={show || undefined} onValueChange={(value) => setValue("show", value, { shouldValidate: true })}>
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
            </div>

            {/* Software, Renderer, Version */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Software</FieldLabel>
                <Select value={service} onValueChange={(value) => setValue("service", value, { shouldValidate: true })}>
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
                <Select value={renderer} onValueChange={(value) => setValue("renderer", value, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arnold">Arnold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel required accent="warm">Version</FieldLabel>
                <Select value={version} onValueChange={(value) => setValue("version", value, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2026">2026</SelectItem>
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
                <FieldLabel accent="warm">Every Nth Frame</FieldLabel>
                <Input
                  type="number"
                  {...register("frameStep", { valueAsNumber: true })}
                  min={1}
                  placeholder="1"
                />
              </div>
            </div>

            {/* Paths */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <FieldLabel required accent="warm">Scene File</FieldLabel>
                  <PathShortcuts
                    shortcuts={SCENE_SHORTCUTS}
                    value={sceneStartPath}
                    onSelect={(path) => {
                      setSceneStartPath(path);
                      if (path) { setSceneFileBrowserOpen(true); }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <Input
                    {...register("sceneFile")}
                    placeholder="Browse or paste UNC path"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant={sceneFileBrowserOpen ? "default" : "ghost"}
                    size="icon"
                    onClick={() => { setSceneFileBrowserOpen(!sceneFileBrowserOpen); }}
                    className={cn(
                      "h-9 w-9 shrink-0 border transition-all",
                      sceneFileBrowserOpen
                        ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white"
                        : "border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5"
                    )}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <InlineFileBrowser
                  open={sceneFileBrowserOpen}
                  onSelect={(path) => { setValue("sceneFile", path, { shouldValidate: true }); }}
                  mode="file"
                  rootPath={ROOT_PATHS[1].path}
                  projectFolder={sceneStartPath}
                  fileExtensions={[".ma", ".mb", ".hip", ".hipnc", ".hiplc"]}
                  currentValue={sceneFile}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <FieldLabel required accent="warm">Output Directory</FieldLabel>
                  <PathShortcuts
                    shortcuts={OUTPUT_SHORTCUTS}
                    value={outputStartPath}
                    onSelect={(path) => {
                      setOutputStartPath(path);
                      if (path) { setOutputPathBrowserOpen(true); }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <Input
                    {...register("outputPath")}
                    placeholder="Browse or paste UNC path"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant={outputPathBrowserOpen ? "default" : "ghost"}
                    size="icon"
                    onClick={() => { setOutputPathBrowserOpen(!outputPathBrowserOpen); }}
                    className={cn(
                      "h-9 w-9 shrink-0 border transition-all",
                      outputPathBrowserOpen
                        ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white"
                        : "border-neutral-200 dark:border-white/8 hover:bg-neutral-100 dark:hover:bg-white/5"
                    )}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <InlineFileBrowser
                  open={outputPathBrowserOpen}
                  onSelect={(path) => { setValue("outputPath", path, { shouldValidate: true }); }}
                  mode="directory"
                  rootPath={ROOT_PATHS[0].path}
                  projectFolder={outputStartPath}
                  currentValue={watch("outputPath")}
                />
              </div>
            </div>

            {/* Layer, Camera, Format — optional with toggle */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="useRenderLayer"
                    checked={useRenderLayer}
                    onCheckedChange={(checked) => setValue("useRenderLayer", !!checked, { shouldValidate: true })}
                    className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <FieldLabel htmlFor="useRenderLayer" accent="warm">Render Layer</FieldLabel>
                </div>
                <Input
                  {...register("renderLayer")}
                  placeholder="e.g., masterLayer"
                  disabled={!useRenderLayer}
                  className={!useRenderLayer ? "opacity-40" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="useCamera"
                    checked={useCamera}
                    onCheckedChange={(checked) => setValue("useCamera", !!checked, { shouldValidate: true })}
                    className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <FieldLabel htmlFor="useCamera" accent="warm">Camera</FieldLabel>
                </div>
                <Input
                  {...register("camera")}
                  placeholder="e.g., shotCam"
                  disabled={!useCamera}
                  className={!useCamera ? "opacity-40" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="useFormat"
                    checked={useFormat}
                    onCheckedChange={(checked) => setValue("useFormat", !!checked, { shouldValidate: true })}
                    className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <FieldLabel htmlFor="useFormat" accent="warm">Format</FieldLabel>
                </div>
                <Select
                  value={imageFormat}
                  disabled={!useFormat}
                  onValueChange={(value) => setValue("imageFormat", value, { shouldValidate: true })}
                >
                  <SelectTrigger className={!useFormat ? "opacity-40" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="exr">EXR</SelectItem>
                    <SelectItem value="tiff">TIFF</SelectItem>
                    <SelectItem value="jpg">JPEG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags & Override Resolution */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-2 space-y-1">
                <FieldLabel accent="warm">Tags</FieldLabel>
                <Input
                  {...register("tags")}
                  placeholder="general"
                  className="font-mono text-xs"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="useResolution"
                    checked={useResolution}
                    onCheckedChange={(checked) => setValue("useResolution", !!checked, { shouldValidate: true })}
                    className="border-neutral-300 dark:border-white/15 h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <FieldLabel htmlFor="useResolution" accent="warm">Width</FieldLabel>
                </div>
                <Input
                  type="number"
                  {...register("resWidth", { valueAsNumber: true })}
                  disabled={!useResolution}
                  className={!useResolution ? "opacity-40" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel accent="warm">Height</FieldLabel>
                <Input
                  type="number"
                  {...register("resHeight", { valueAsNumber: true })}
                  disabled={!useResolution}
                  className={!useResolution ? "opacity-40" : ""}
                />
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
