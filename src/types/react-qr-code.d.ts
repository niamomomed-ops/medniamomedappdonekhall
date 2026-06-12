declare module "react-qr-code" {
  import * as React from "react";
  interface QRCodeProps {
    value: string;
    size?: number;
    bgColor?: string;
    fgColor?: string;
    level?: "L" | "M" | "Q" | "H";
    title?: string;
    style?: React.CSSProperties;
    className?: string;
    viewBox?: string;
  }
  const QRCode: React.FC<QRCodeProps>;
  export default QRCode;
}
