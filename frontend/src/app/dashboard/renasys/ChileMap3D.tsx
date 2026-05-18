"use client";

import { useState, useMemo, useEffect } from "react";
import DeckGL from "@deck.gl/react";
import { ColumnLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { GeoJsonLayer } from "@deck.gl/layers";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";

interface Ciudad {
  ciudad: string; region: string; lat: number; lon: number;
  n_clientes: number; venta: number; contrib: number; margen: number;
}
interface Props { ciudades: Ciudad[] }

const INITIAL_VIEW = {
  longitude: -71.0, latitude: -34.0,
  zoom: 4.8, pitch: 48, bearing: 90,
};

const fmt = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return "$" + (abs / 1e6).toFixed(1) + "M";
  return "$" + abs.toLocaleString("es-CL");
};

// Color por margen: verde / amarillo / rojo — más fácil de leer que ranking
const margenRgb = (m: number): [number,number,number] => {
  if (m >= 45) return [5,  150, 105];   // esmeralda oscuro
  if (m >= 40) return [16, 185, 129];   // esmeralda
  if (m >= 35) return [20, 184, 166];   // teal
  if (m >= 30) return [245,158, 11];    // ámbar
  if (m >= 25) return [249,115, 22];    // naranja
  return             [239, 68,  68];    // rojo
};

export default function ChileMap3D({ ciudades: ciudadesRaw }: Props) {
  const ciudades = Array.isArray(ciudadesRaw) ? ciudadesRaw : [];
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: Ciudad } | null>(null);
  const [chileGeo, setChileGeo] = useState<any>(null);

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson")
      .then(r => r.json())
      .then(data => setChileGeo({
        type: "FeatureCollection",
        features: data.features.filter((f: any) =>
          f.properties?.ADMIN === "Chile" || f.properties?.NAME === "Chile"
        ),
      }))
      .catch(() => {});
  }, []);

  const maxVenta = useMemo(() =>
    ciudades.length > 0 ? Math.max(...ciudades.map(c => c.venta)) : 1,
  [ciudades]);

  const totalVenta = useMemo(() => ciudades.reduce((s, c) => s + c.venta, 0), [ciudades]);

  const topCiudades = useMemo(() =>
    [...ciudades].sort((a, b) => b.venta - a.venta).slice(0, 5),
  [ciudades]);

  const layers = useMemo(() => {
    const result: any[] = [
      new TileLayer({
        id: "basemap",
        data: "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
        minZoom: 0, maxZoom: 19,
        renderSubLayers: (props: any) => {
          const { boundingBox } = props.tile;
          return new BitmapLayer(props, {
            data: undefined, image: props.data,
            bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
          });
        },
      }),
    ];

    if (chileGeo) {
      result.push(new GeoJsonLayer({
        id: "chile", data: chileGeo, extruded: false,
        getFillColor: [219, 234, 254, 90],
        getLineColor: [96, 165, 250, 200],
        lineWidthMinPixels: 1, pickable: false,
      }));
    }

    // Halo difuso base
    result.push(new ScatterplotLayer({
      id: "halo", data: ciudades,
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 30000,
      getFillColor: (d: any) => { const [r,g,b] = margenRgb(d.margen); return [r,g,b,25]; },
      radiusUnits: "meters", pickable: false,
    }));

    // Disco base sólido
    result.push(new ScatterplotLayer({
      id: "base", data: ciudades,
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 14000,
      getFillColor: (d: any) => { const [r,g,b] = margenRgb(d.margen); return [r,g,b,255]; },
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 2, stroked: true,
      radiusUnits: "meters", pickable: false,
    }));

    // Barras 3D — altura = venta, color = margen
    result.push(new ColumnLayer({
      id: "bars", data: ciudades,
      getPosition: (d: any) => [d.lon, d.lat],
      getElevation: (d: any) => Math.max((d.venta / maxVenta) * 500000, 15000),
      getFillColor: (d: any) => { const [r,g,b] = margenRgb(d.margen); return [r,g,b,210]; },
      getLineColor: (d: any) => { const [r,g,b] = margenRgb(d.margen); return [r,g,b,255]; },
      diskResolution: 20, radius: 16000, elevationScale: 1, extruded: true,
      pickable: true, autoHighlight: true, highlightColor: [255,255,255,90],
      onHover: (info: any) =>
        setTooltip(info.object ? { x: info.x, y: info.y, data: info.object } : null),
    }));

    // Etiqueta: nombre + venta sobre cada barra
    result.push(new TextLayer({
      id: "labels", data: ciudades,
      getPosition: (d: any) => [d.lon, d.lat, Math.max((d.venta / maxVenta) * 500000, 15000) + 18000],
      getText: (d: any) => `${d.ciudad}\n${fmt(d.venta)}`,
      getSize: 12,
      getColor: (d: any) => { const [r,g,b] = margenRgb(d.margen); return [r,g,b,255]; },
      fontWeight: "bold",
      background: true,
      getBackgroundColor: [255, 255, 255, 220],
      backgroundPadding: [6, 3, 6, 3],
      getPixelOffset: [0, -8],
      sizeUnits: "pixels",
      fontFamily: "system-ui, sans-serif",
      lineHeight: 1.5,
    }));

    return result;
  }, [ciudades, chileGeo, maxVenta]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller={false}
        layers={layers}
      />

      {/* Tooltip hover */}
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.x + 16, top: tooltip.y - 12,
          background: "white", borderRadius: 10, padding: "10px 14px",
          border: "1px solid #E2E8F0", boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          pointerEvents: "none", zIndex: 100, minWidth: 200,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", marginBottom: 8, borderBottom: "1px solid #F1F5F9", paddingBottom: 6 }}>
            📍 {(tooltip.data as any).ciudad}
          </div>
          {([
            ["Venta mes",    fmt((tooltip.data as any).venta)],
            ["Contribución", fmt((tooltip.data as any).contrib)],
            ["Margen",       (tooltip.data as any).margen.toFixed(1) + "%"],
            ["Clientes",     String((tooltip.data as any).n_clientes)],
            ["% del total",  totalVenta > 0 ? (((tooltip.data as any).venta / totalVenta) * 100).toFixed(1) + "%" : "—"],
          ] as [string,string][]).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: "#64748B" }}>{k}</span>
              <span style={{ color: "#0F172A", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Panel Top 5 ciudades — izquierda */}
      {topCiudades.length > 0 && (
        <div style={{
          position: "absolute", top: 14, left: 14,
          background: "rgba(255,255,255,0.96)", borderRadius: 10, padding: "10px 14px",
          border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          fontSize: 12, minWidth: 190,
        }}>
          <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 10, fontSize: 12 }}>
            Top ciudades · mes
          </div>
          {topCiudades.map((c, i) => {
            const [r,g,b] = margenRgb(c.margen);
            const pct = totalVenta > 0 ? (c.venta / totalVenta * 100) : 0;
            return (
              <div key={c.ciudad} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#94A3B8", fontSize: 10, width: 14 }}>{i + 1}</span>
                    <span style={{ fontWeight: 600, color: "#0F172A" }}>{c.ciudad}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: `rgb(${r},${g},${b})` }}>{fmt(c.venta)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: "#F1F5F9", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: `rgb(${r},${g},${b})`, borderRadius: 2 }} />
                  </div>
                  <span style={{ color: "#94A3B8", fontSize: 10, width: 32, textAlign: "right" }}>
                    {c.margen.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leyenda colores — derecha */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        background: "rgba(255,255,255,0.96)", borderRadius: 10, padding: "10px 14px",
        border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", fontSize: 12,
      }}>
        <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Color = Margen</div>
        {([
          ["#059669", "≥ 45%"],
          ["#10B981", "40–45%"],
          ["#14B8A6", "35–40%"],
          ["#F59E0B", "30–35%"],
          ["#F97316", "25–30%"],
          ["#EF4444", "< 25%"],
        ] as [string,string][]).map(([color, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, color: "#374151" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
        <div style={{ marginTop: 8, borderTop: "1px solid #F1F5F9", paddingTop: 8, color: "#6B7280", fontSize: 11 }}>
          Altura = Venta mes<br/>
          {ciudades.length} ciudades activas
        </div>
      </div>
    </div>
  );
}
