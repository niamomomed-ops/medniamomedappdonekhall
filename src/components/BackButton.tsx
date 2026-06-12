import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Path to navigate to when there is no browser history to go back to. */
  fallback: string;
  label?: string;
  className?: string;
};

export function BackButton({ fallback, label = "Retour", className }: Props) {
  const navigate = useNavigate();
  const router = useRouter();

  const handleClick = () => {
    const canGoBack =
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      router.history.location.pathname !== fallback;
    if (canGoBack) {
      router.history.back();
    } else {
      navigate({ to: fallback });
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={className}
    >
      <ArrowLeft className="mr-1 h-4 w-4" />
      {label}
    </Button>
  );
}