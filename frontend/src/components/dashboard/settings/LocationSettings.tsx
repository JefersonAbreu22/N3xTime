import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Crosshair, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';

// Fix leaflet default icon issue in React
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationSettingsProps {
  latitude: number | string;
  longitude: number | string;
  allowedRadius: number | string;
  blockOutsideArea: boolean;
  onChange: (updates: { latitude?: number; longitude?: number; allowed_radius?: number; block_outside_area?: boolean }) => void;
  onGeocodeRequest: () => void;
}

// Component to handle map clicks and update position
function MapEvents({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to programmatically update map view when coordinates change from outside
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

export default function LocationSettings({
  latitude,
  longitude,
  allowedRadius,
  blockOutsideArea,
  onChange,
  onGeocodeRequest
}: LocationSettingsProps) {
  const lat = Number(latitude) || -23.5505;
  const lng = Number(longitude) || -46.6333;
  const radius = Number(allowedRadius) || 200;
  
  const hasValidCoordinates = !!latitude && !!longitude;
  const center: [number, number] = [lat, lng];

  const handleLocationSelect = (newLat: number, newLng: number) => {
    onChange({ latitude: newLat, longitude: newLng });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada pelo seu navegador.');
      return;
    }
    toast.loading('Obtendo localização...', { id: 'gps' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        toast.success('Localização obtida!', { id: 'gps' });
      },
      (error) => {
        console.error(error);
        toast.error('Erro ao obter localização. Verifique as permissões.', { id: 'gps' });
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="border-t border-[#ece8e8] pt-6 mt-6">
      <div className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#026666]" />
            <h4 className="text-lg font-semibold text-[#191717]">Localização e Ponto Remoto</h4>
          </div>
          <p className="text-sm text-[#6e6a6a] mt-1">
            Defina o perímetro válido para os colaboradores registrarem ponto via celular.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleGetCurrentLocation} className="btn-secondary whitespace-nowrap flex items-center gap-2 text-sm">
            <Navigation className="h-4 w-4" />
            Minha localização atual
          </button>
          <button type="button" onClick={onGeocodeRequest} className="btn-secondary whitespace-nowrap flex items-center gap-2 text-sm">
            <Crosshair className="h-4 w-4" />
            Buscar pelo endereço digitado
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 relative z-0 h-[400px] rounded-xl overflow-hidden border border-[#ece8e8] shadow-sm">
          <MapContainer 
            center={center} 
            zoom={hasValidCoordinates ? 16 : 4} 
            scrollWheelZoom={true} 
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {hasValidCoordinates && (
              <>
                <Marker position={center} />
                <Circle 
                  center={center} 
                  pathOptions={{ fillColor: '#026666', color: '#026666', fillOpacity: 0.2 }} 
                  radius={radius} 
                />
              </>
            )}
            <MapEvents onLocationSelect={handleLocationSelect} />
            <MapUpdater center={center} />
          </MapContainer>
          
          {!hasValidCoordinates && (
            <div className="absolute inset-0 z-[1000] bg-white/60 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-4 rounded-xl shadow-lg text-center max-w-sm border border-[#ece8e8]">
                <MapPin className="h-8 w-8 text-[#6e6a6a] mx-auto mb-2" />
                <h5 className="font-semibold text-[#191717] mb-1">Localização não definida</h5>
                <p className="text-sm text-[#6e6a6a]">Busque pelo endereço, use sua localização atual ou clique no mapa para definir a sede da empresa.</p>
              </div>
            </div>
          )}
          
          {hasValidCoordinates && (
             <div className="absolute bottom-4 left-4 z-[1000] bg-white px-3 py-2 rounded-lg shadow-md border border-[#ece8e8] text-xs font-medium text-[#191717] pointer-events-none">
                Clique no mapa para mover o marcador
             </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-[#fcfbfb] p-4 rounded-xl border border-[#ece8e8]">
            <h5 className="font-semibold text-[#191717] text-sm mb-3">Coordenadas da Sede</h5>
            <div className="space-y-3">
              <div>
                <label className="field-label text-xs">Latitude</label>
                <input 
                  type="number" 
                  step="any" 
                  className="field-input font-mono text-sm" 
                  value={latitude} 
                  onChange={(e) => onChange({ latitude: Number(e.target.value) })} 
                  placeholder="-22.9068" 
                />
              </div>
              <div>
                <label className="field-label text-xs">Longitude</label>
                <input 
                  type="number" 
                  step="any" 
                  className="field-input font-mono text-sm" 
                  value={longitude} 
                  onChange={(e) => onChange({ longitude: Number(e.target.value) })} 
                  placeholder="-43.1729" 
                />
              </div>
            </div>
          </div>

          <div className="bg-[#fcfbfb] p-4 rounded-xl border border-[#ece8e8]">
            <h5 className="font-semibold text-[#191717] text-sm mb-3">Regras de Perímetro</h5>
            <div className="space-y-4">
              <div>
                <label className="field-label text-xs">Raio permitido (metros)</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="50" 
                    max="2000" 
                    step="50" 
                    className="flex-1 accent-[#026666]" 
                    value={radius} 
                    onChange={(e) => onChange({ allowed_radius: Number(e.target.value) })} 
                  />
                  <input 
                    type="number" 
                    className="field-input w-24 text-center font-medium" 
                    value={radius} 
                    onChange={(e) => onChange({ allowed_radius: Number(e.target.value) })} 
                  />
                </div>
              </div>
              
              <div className="pt-2 border-t border-[#ece8e8]">
                <label className="flex items-start gap-3 text-sm text-[#191717] cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={blockOutsideArea} 
                    onChange={(e) => onChange({ block_outside_area: e.target.checked })} 
                    className="mt-1 w-4 h-4 text-[#026666] border-[#d9d7d7] rounded focus:ring-[#026666]" 
                  />
                  <div>
                    <span className="font-medium block">Bloqueio Rigoroso</span>
                    <span className="text-xs text-[#6e6a6a] mt-0.5 block leading-relaxed">
                      Se ativado, impede o registro fora do raio. Se desativado, permite registrar mas gera alerta de "Fora da área".
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
