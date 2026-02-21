import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { projectsApi as onlineProjectsApi, catalogueApi as onlineCatalogueApi, WellPlacedProject, WellPlacedObject } from '../api/client'
import { useImagesApi, useObjectsApi, useCatalogueApi } from '../pwa/hooks/useApi'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import SearchBar from '../components/SearchBar'
import { WellPlacedCard } from '../components/ProjectCard'
import WellPlacedObjectCard from '../components/WellPlacedObjectCard'

export default function Dashboard() {
  const imagesApi = useImagesApi()
  const objectsApi = useObjectsApi()
  const catalogueApi = useCatalogueApi()
  const pwa = isPwaMode()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['imageStats'],
    queryFn: () => imagesApi.getStats(),
  })

  const { data: recentObjects } = useQuery({
    queryKey: ['recentObjects'],
    queryFn: () => objectsApi.list({ limit: 5 }),
  })

  const { data: catalogues } = useQuery({
    queryKey: ['catalogues'],
    queryFn: () => catalogueApi.getCatalogs(),
  })

  // Well-placed features not available in PWA mode (requires live location/time calculation)
  const { data: wellPlacedProjects } = useQuery({
    queryKey: ['wellPlacedProjects'],
    queryFn: () => onlineProjectsApi.getWellPlaced(5),
    enabled: !pwa,
  })

  const { data: wellPlacedObjects } = useQuery({
    queryKey: ['wellPlacedObjects'],
    queryFn: () => onlineCatalogueApi.getWellPlaced({ limit: 5, min_size: 10 }),
    enabled: !pwa,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Astrophotography Database</h1>
        <p className="text-gray-400">Index and explore your astrophotography collection</p>
      </div>

      <div className="max-w-xl">
        <SearchBar placeholder="Search for objects (e.g., M42, NGC 7000)..." />
      </div>

      {statsLoading ? (
        <div className="text-gray-400">Loading statistics...</div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="card">
            <div className="text-3xl font-bold text-blue-400">{stats.total_images}</div>
            <div className="text-gray-400">Total Images</div>
          </div>
          <div className="card">
            <div className="text-3xl font-bold text-purple-400">{stats.objects_imaged}</div>
            <div className="text-gray-400">Objects Imaged</div>
          </div>
          <div className="card">
            <div className="text-3xl font-bold text-green-400">{stats.total_exposure_hours}</div>
            <div className="text-gray-400">Hours of Exposure</div>
          </div>
          <div className="card">
            <div className="text-3xl font-bold text-yellow-400">
              {catalogues ? Object.keys(catalogues).length : 0}
            </div>
            <div className="text-gray-400">Catalogues Installed</div>
          </div>
        </div>
      ) : null}

      {wellPlacedProjects && (
        wellPlacedProjects.location_configured ? (
          wellPlacedProjects.projects.length > 0 && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Well-Placed Projects Tonight</h2>
                <Link to="/projects" className="text-blue-400 hover:text-blue-300 text-sm">
                  View all
                </Link>
              </div>
              <div className="space-y-2">
                {wellPlacedProjects.projects.map((project: WellPlacedProject) => (
                  <WellPlacedCard key={project.project_id} project={project} />
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Well-Placed Projects Tonight</h2>
            </div>
            <div className="text-gray-400">
              <p>Configure your observing location to see visibility data.</p>
              <Link to="/settings" className="text-blue-400 hover:text-blue-300 mt-2 inline-block">
                Go to Settings
              </Link>
            </div>
          </div>
        )
      )}

      {wellPlacedObjects &&
        wellPlacedObjects.location_configured &&
        wellPlacedObjects.objects.length > 0 && (
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Well-Placed Objects Tonight</h2>
              <Link
                to="/objects?visible_tonight=true"
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {wellPlacedObjects.objects.map((obj: WellPlacedObject) => (
                <WellPlacedObjectCard key={obj.id} object={obj} />
              ))}
            </div>
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {catalogues && Object.keys(catalogues).length > 0 && (
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Installed Catalogues</h2>
              <Link to="/catalogue" className="text-blue-400 hover:text-blue-300 text-sm">
                Browse
              </Link>
            </div>
            <div className="space-y-2">
              {Object.entries(catalogues).map(([catalog, count]) => (
                <div key={catalog} className="flex justify-between items-center">
                  <span className="badge badge-blue">{catalog}</span>
                  <span className="text-gray-300">{count.toLocaleString()} objects</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats && Object.keys(stats.by_telescope).length > 0 && (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Images by Telescope</h2>
            <div className="space-y-2">
              {Object.entries(stats.by_telescope).map(([telescope, count]) => (
                <div key={telescope} className="flex justify-between items-center">
                  <span className="text-gray-200 truncate mr-4">{telescope}</span>
                  <span className="text-gray-400">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {recentObjects && recentObjects.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Objects</h2>
            <Link to="/objects" className="text-blue-400 hover:text-blue-300 text-sm">
              View all
            </Link>
          </div>
          <div className="divide-y divide-space-700">
            {recentObjects.map((obj) => (
              <Link
                key={obj.id}
                to={`/objects/${obj.id}`}
                className="block py-3 hover:bg-space-700 -mx-4 px-4 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{obj.primary_name}</span>
                    {obj.object_type && (
                      <span className="text-gray-400 text-sm ml-2">({obj.object_type})</span>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">
                    {obj.image_count ?? 0} images
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
