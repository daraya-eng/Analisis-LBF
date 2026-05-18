"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Region {
  region: string; nombre: string; lat: number; lon: number;
  venta: number; contrib: number; margen: number; n_clientes: number; top_cliente: string;
}

interface Props {
  regiones: Region[];
  regionFiltro: string | null;
  onRegionClick: (region: string) => void;
}

const fmt = (n: number) => {
  if (!n && n !== 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return "$" + (abs / 1e9).toFixed(1) + "MM";
  if (abs >= 1e6) return "$" + (abs / 1e6).toFixed(1) + "M";
  return "$" + abs.toLocaleString("es-CL");
};
const margenColor = (m: number) => m >= 40 ? "#10B981" : m >= 30 ? "#F59E0B" : "#EF4444";

const CHILE_CENTER: LatLngExpression = [-35.5, -71.5];

function FitBounds({ regiones }: { regiones: Region[] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(CHILE_CENTER, 5);
  }, [map]);
  return null;
}

export default function ChileMap({ regiones, regionFiltro, onRegionClick }: Props) {
  if (regiones.length === 0) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>
      Sin datos para el período seleccionado
    </div>
  );

  const maxVenta = Math.max(...regiones.map(r => r.venta), 1);

  return (
    <MapContainer
      center={CHILE_CENTER}
      zoom={5}
      style={{ height: "100%", width: "100%", background: "#F8FAFC" }}
      zoomControl={true}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds regiones={regiones} />

      {regiones.map((r) => {
        const isActive = !regionFiltro || regionFiltro === r.region;
        const radius = Math.max(12, Math.sqrt(r.venta / maxVenta) * 52);
        const color = margenColor(r.margen);
        const pos: LatLngExpression = [r.lat, r.lon];

        return (
          <CircleMarker
            key={r.region}
            center={pos}
            radius={radius}
            pathOptions={{
              color: regionFiltro === r.region ? "#1D4ED8" : color,
              fillColor: color,
              fillOpacity: isActive ? 0.75 : 0.2,
              weight: regionFiltro === r.region ? 3 : 1.5,
              opacity: isActive ? 1 : 0.4,
            }}
            eventHandlers={{ click: () => onRegionClick(r.region) }}
          >
            <Popup>
              <div style={{ minWidth: 200, fontFamily: "system-ui, sans-serif" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: "#0F172A" }}>{r.nombre}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {[
                      ["Venta mes", fmt(r.venta)],
                      ["Contribución", fmt(r.contrib)],
                      ["Margen", r.margen.toFixed(1) + "%"],
                      ["Clientes", String(r.n_clientes)],
                      ["Top cliente", r.top_cliente],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: "3px 0", color: "#64748B" }}>{k}</td>
                        <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600, color: "#0F172A" }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
                  Clic para filtrar clientes
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
