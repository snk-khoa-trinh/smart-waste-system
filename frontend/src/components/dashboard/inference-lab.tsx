import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImageIcon, LoaderCircle } from "lucide-react";
import { api, labels } from "@/api";
import type { Category } from "@/api";
import { useAPI } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordFilter } from "./record-filter";

type Config = {
  provider: string;
  max_upload_bytes: number;
  max_pixels: number;
  confidence_threshold: number;
};
type Result = {
  decision: string;
  reason: string | null;
  provider: string;
  confidence: number | null;
  raw_label: string | null;
  model: string;
};
const size = (bytes: number) =>
  bytes >= 1_000_000
    ? `${+(bytes / 1_000_000).toFixed(2)} MB`
    : `${+(bytes / 1000).toFixed(1)} KB`;
export function InferenceLab() {
  const config = useAPI<Config>("/inference/config");
  const [image, setImage] = useState<{
    file: File;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [validation, setValidation] = useState("");
  const [checking, setChecking] = useState(false);
  const [scenario, setScenario] = useState("plastic");
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  const inference = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("image", image!.file);
      form.set("scenario", scenario);
      return api<Result>("/inference/test", { method: "POST", body: form });
    },
    retry: false,
  });
  const clear = () => {
    generation.current++;
    setImage(null);
    setValidation("");
    setChecking(false);
    inference.reset();
    if (input.current) input.current.value = "";
  };
  const select = async (file?: File) => {
    clear();
    if (!file || !config.data) return;
    const version = generation.current;
    if (
      !/\.jpe?g$/i.test(file.name) ||
      (file.type && file.type !== "image/jpeg")
    ) {
      setValidation("Choose a JPEG image (.jpg or .jpeg).");
      return;
    }
    if (!file.size || file.size > config.data.max_upload_bytes) {
      setValidation(
        `Image must be larger than 0 bytes and no more than ${size(config.data.max_upload_bytes)}.`,
      );
      return;
    }
    setChecking(true);
    const url = URL.createObjectURL(file);
    const picture = new Image();
    picture.src = url;
    try {
      await picture.decode();
      if (version !== generation.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (picture.naturalWidth * picture.naturalHeight > config.data.max_pixels)
        throw new Error(
          `Image exceeds ${config.data.max_pixels / 1_000_000} megapixels. Resize it before uploading.`,
        );
      setImage({
        file,
        url,
        width: picture.naturalWidth,
        height: picture.naturalHeight,
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      if (version === generation.current)
        setValidation(
          error instanceof Error && error.message.startsWith("Image exceeds")
            ? error.message
            : "This image could not be read. Choose a valid JPEG.",
        );
    } finally {
      if (version === generation.current) setChecking(false);
    }
  };
  return (
    <section
      className="grid gap-6 lg:grid-cols-2"
      aria-label="Image classifier"
    >
      <form
        className="card space-y-4 min-w-0"
        onSubmit={(e) => {
          e.preventDefault();
          if (image && !inference.isPending) inference.mutate();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2>Test image</h2>
          {config.data && <span className="badge">{config.data.provider}</span>}
        </div>
        <label className="grid gap-2 text-sm">
          JPEG image
          <Input
            ref={input}
            type="file"
            accept="image/jpeg,.jpg,.jpeg"
            disabled={!config.data || inference.isPending}
            aria-describedby="image-limits"
            aria-invalid={!!validation}
            onChange={(e) => void select(e.target.files?.[0])}
          />
        </label>
        <p id="image-limits" className="text-xs text-muted-foreground">
          {config.data
            ? `JPEG (.jpg, .jpeg) · Up to ${size(config.data.max_upload_bytes)} · Up to ${config.data.max_pixels / 1_000_000} megapixels`
            : "Loading upload limits…"}
        </p>
        {config.isError && (
          <p role="alert" className="error">
            Upload settings unavailable: {config.error.message}
          </p>
        )}
        {validation && (
          <p role="alert" className="error">
            {validation}
          </p>
        )}
        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-md border border-border">
          {image ? (
            <img
              src={image.url}
              alt="Selected image preview"
              className="max-h-80 max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
              <ImageIcon aria-hidden="true" />
              {checking ? "Checking image…" : "Select an image to preview"}
            </div>
          )}
        </div>
        {image && (
          <p className="break-all text-xs text-muted-foreground">
            {image.file.name} · {size(image.file.size)} · {image.width} ×{" "}
            {image.height} px
          </p>
        )}
        {config.data?.provider === "mock" && (
          <RecordFilter
            disabled={inference.isPending}
            label="Repeatable mock scenario"
            value={scenario}
            onChange={(value) => {
              setScenario(value);
              inference.reset();
            }}
            options={[
              "plastic",
              "battery",
              "trash",
              "low",
              "unknown",
              "ambiguous",
              "timeout",
            ].map((s) => [s, s])}
          />
        )}
        <div className="flex gap-2">
          <Button
            disabled={!image || checking || inference.isPending || !config.data}
          >
            {inference.isPending && <LoaderCircle className="animate-spin" />}
            {inference.isPending ? "Classifying…" : "Classify image"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={inference.isPending || (!image && !validation)}
            onClick={clear}
          >
            Clear
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tests aren’t saved to bin records and don’t move hardware.
          {config.data?.provider === "roboflow"
            ? " Each request may use inference credits."
            : ""}
        </p>
      </form>
      <article
        className="card min-w-0 self-start space-y-4"
        aria-label="Classification result"
        aria-busy={inference.isPending}
      >
        <h2>Decision</h2>
        {inference.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Analyzing the selected image…
          </p>
        ) : inference.isError ? (
          <p role="alert" className="error">
            {inference.error.message}
          </p>
        ) : inference.data ? (
          <div className="result space-y-4" role="status">
            <div>
              <h3 className="text-xl font-semibold">
                {labels[inference.data.decision as Category] || "Unknown"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {inference.data.confidence === null
                  ? "Confidence unavailable"
                  : `${Math.round(inference.data.confidence * 100)}% confidence`}
              </p>
            </div>
            {inference.data.reason && (
              <p className="text-sm">{inference.data.reason}</p>
            )}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Model label</dt>
              <dd className="break-all">
                {inference.data.raw_label || "None"}
              </dd>
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{inference.data.provider}</dd>
              <dt className="text-muted-foreground">Model</dt>
              <dd className="break-all">{inference.data.model}</dd>
            </dl>
            {config.data && (
              <p className="text-xs text-muted-foreground">
                Decision threshold:{" "}
                {Math.round(config.data.confidence_threshold * 100)}%.
                Unsupported or uncertain results return Unknown.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose an image, then classify it to see the category, confidence
            and model label.
          </p>
        )}
      </article>
    </section>
  );
}
