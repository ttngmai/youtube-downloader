import { ClipboardPaste, LoaderCircle, Search } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UrlInputProps {
  url: string;
  disabled?: boolean;
  isLoading?: boolean;
  onUrlChange: (url: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
}

export function UrlInput({
  url,
  disabled = false,
  isLoading = false,
  onUrlChange,
  onPaste,
  onSubmit,
}: UrlInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <Label htmlFor="youtube-url">YouTube URL</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="youtube-url"
          value={url}
          disabled={disabled}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="YouTube URL을 입력하세요..."
          aria-busy={isLoading}
          className="h-9 min-w-0 flex-1"
          onChange={(event) => onUrlChange(event.currentTarget.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || isLoading}
          className="h-9 shrink-0"
          onClick={onPaste}
        >
          <ClipboardPaste />
          붙여넣기
        </Button>
        <Button type="submit" disabled={disabled || isLoading} className="h-9 shrink-0">
          {isLoading ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Search />
          )}
          조회
        </Button>
      </div>
    </form>
  );
}
