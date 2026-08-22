import { ArrowLeft, Download, Eye, FileText, Star, StarOff } from "lucide-react";
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
      <header className="rl-head tone-amber">
        <div className="rl-head-top">
          <Link to="/resources" className="rl-back" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>

          <p className="rl-eyebrow">Saved on this device</p>
        </div>

        <h1>Favorites</h1>

        <p className="rl-meta">
          {favorites.length === 0
            ? "Nothing saved yet"
            : `${favorites.length} ${
                favorites.length === 1 ? "item" : "items"
              } saved`}
        </p>
      </header>

      {favorites.length > 0 ? (
        <section className="list tone-amber">
          {favorites.map((item) => (
            <FavoriteRow
              key={item.id}
              item={item}
              onRemove={() => handleRemove(item.id)}
            />
          ))}
        </section>
      ) : (
        <section className="rl-empty">
          <div className="ico ico-md ico--tint tone-amber">
            <Star size={24} />
          </div>

          <h3>No favorites yet</h3>

          <p>
            Tap the star on any resource and it will be saved here for quick
            access, even offline.
          </p>
        </section>
      )}
    </>
  );
}

function FavoriteRow({ item, onRemove }) {
  const viewerPath = item.external_link
    ? `/resource-viewer?url=${encodeURIComponent(
        item.external_link
      )}&title=${encodeURIComponent(item.title || "Resource")}`
    : "";

  const downloadLink = getDriveDownloadLink(item.external_link);

  const meta = [item.course_code || item.category, item.semester, item.level]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="row file-row">
      {viewerPath ? (
        <Link to={viewerPath} className="file-open" aria-label={item.title}>
          <span className="file-ico">
            <FileText size={20} />
          </span>

          <span className="file-text">
            <h3>{item.title}</h3>
            <p>{meta || "Saved resource"}</p>
          </span>
        </Link>
      ) : (
        <span className="file-open is-dead">
          <span className="file-ico">
            <FileText size={20} />
          </span>

          <span className="file-text">
            <h3>{item.title}</h3>
            <p>{meta || "Saved resource"}</p>
          </span>
        </span>
      )}

      <div className="file-actions">
        <button
          type="button"
          className="is-fav"
          onClick={onRemove}
          title="Remove from favorites"
          aria-label="Remove from favorites"
        >
          <StarOff size={16} />
        </button>

        {viewerPath ? (
          <Link
            to={viewerPath}
            className="act-view"
            title="View"
            aria-label="View resource"
          >
            <Eye size={16} />
          </Link>
        ) : (
          <button type="button" disabled aria-label="View unavailable">
            <Eye size={16} />
          </button>
        )}

        {downloadLink ? (
          <a
            className="act-open"
            href={downloadLink}
            target="_blank"
            rel="noreferrer"
            title="Download"
            aria-label="Download resource"
          >
            <Download size={16} />
          </a>
        ) : (
          <button type="button" disabled aria-label="Download unavailable">
            <Download size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

export default Favorites;
