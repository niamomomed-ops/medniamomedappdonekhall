import { useEffect, useState, type ComponentType, type CSSProperties } from "react";

type QRCodeProps = {
  value: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
};

export function ClientQRCode(props: QRCodeProps) {
  const [QRCode, setQRCode] = useState<ComponentType<QRCodeProps> | null>(null);

  useEffect(() => {
    let mounted = true;

    import("react-qr-code").then((mod) => {
      if (mounted) setQRCode(() => mod.default as ComponentType<QRCodeProps>);
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!QRCode) {
    const size = props.size ?? 96;
    return (
      <div
        aria-hidden="true"
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
      />
    );
  }

  return <QRCode {...props} />;
}