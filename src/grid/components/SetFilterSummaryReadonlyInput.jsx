import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { fitSetFilterDisplayText } from "../utils/setFilterDisplayText";

const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
const canvasCtx = canvas?.getContext("2d");

export const SetFilterSummaryReadonlyInput = ({ count, values, columnLabel, className, placeholder, onClick }) => {
  const inputRef = useRef(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const valuesKey = values.join("\0");

  const [text, setText] = useState(() => {
    if (!values.length) return `(${count})`;
    const head = values.slice(0, 2).join(", ");
    return values.length > 2 ? `(${count}) ${head}, ...` : `(${count}) ${head}`;
  });

  const recompute = useCallback(() => {
    const el = inputRef.current;
    const list = valuesRef.current;
    if (!el || !list.length) {
      setText(`(${count})`);
      return;
    }

    const style = getComputedStyle(el);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const contentW = el.clientWidth - padL - padR;
    const font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const measureText = (t) => {
      if (canvasCtx) {
        canvasCtx.font = font;
        return canvasCtx.measureText(t).width;
      }
      return t.length * (parseFloat(style.fontSize) || 14) * 0.55;
    };

    setText(fitSetFilterDisplayText(count, list, contentW, measureText));
  }, [count, valuesKey]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recompute]);

  return <input ref={inputRef} type='text' className={className} placeholder={placeholder} readOnly aria-readOnly aria-label={`${columnLabel} filter: ${count} values selected`} value={text} onChange={() => {}} onClick={onClick} />;
};
