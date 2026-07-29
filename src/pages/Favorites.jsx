import { ArrowLeft, Eye, FileText, Star, StarOff } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getDriveDownloadLink } from "../utils/driveLinks";
import { getFavorites, removeFavorite } from "../utils/localLibrary";

function Favorites() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  function handleRemove(id) {
    const updated = removeFavorite(id);
    setFavorites(updated);
  }

  return (
    <>
      <section className="page-header materials-header">
        <Link to="/resources" className="back-link">
          <ArrowLeft size={18} />
          Resources
        </Link>

        <p>Saved for quick access</p>
        <h1>Favorites</h1>
        <span>Resources you've starred, saved on this device.</span>
      </section>

      {favorites.length > 0 ? (
        <section className="organized-resource-list">
          <div className="result-count">
            <span>{favorites.length} item(s) saved</span>
          </div>

          <div className="compact-list">
            {favorites.map((item) => {
              const viewerPath = item.external_link
                ? `/resource-viewer?url=${encodeURIComponent(
                    item.external_link
                  )}&title=${encodeURIComponent(item.title || "Resource")}`
                : "";

              const downloadLink = getDriveDownloadLink(item.external_link);

              return (
                <article className="compact-resource-card" key={item.id}>
                  <div className="compact-resource-icon blue">
                    <FileText size={20} />
                  </div>

                  <div className="compact-resource-content">
                    <h3>{item.title}</h3>
                    <p>
                      {item.course_code || item.category || "General"} •{" "}
                      {item.level || "No level"}
                    </p>

                    <span className="resource-type-pill blue-pill">
                      {item.semester || item.category || ""}
                    </span>
                  </div>

                  <div className="compact-actions">
                    <button
                      type="button"
                      className="favorite-toggle active"
                      onClick={() => handleRemove(item.id)}
                      title="Remove from favorites"
                      aria-label="Remove from favorites"
                    >
                      <StarOff size={14} />
                    </button>

                    {viewerPath ? (
                      <Link to={viewerPath} title="View" aria-label="View resource">
                        <Eye size={14} />
                      </Link>
                    ) : (
                      <button disabled>
                        <Eye size={14} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="empty-state">
          <Star size={30} />
          <h3>No favorites yet</h3>
          <p>Tap the star on any resource to save it here for quick access.</p>
        </div>
      )}
    </>
  );
}

export default Favorites;
