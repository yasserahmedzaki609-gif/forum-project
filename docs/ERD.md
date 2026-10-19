# Entity-Relationship Diagram (ERD)

## Visual Diagram

```mermaid
erDiagram
    users ||--o{ sessions        : "has"
    users ||--o{ posts           : "authors"
    users ||--o{ comments        : "writes"
    users ||--o{ identities      : "links"
    users ||--o{ reactions       : "gives"
    users ||--o{ media           : "uploads"
    users ||--o{ reports         : "submits"
    users ||--o{ notifications   : "receives"
    users ||--o{ notifications   : "triggers (actor)"
    users ||--o{ activity_logs   : "performs"

    posts ||--o{ comments        : "contains"
    posts ||--o{ post_categories : "tagged"
    posts ||--o{ reactions       : "receives as post"
    posts ||--o{ media           : "attaches"
    posts ||--o{ reports         : "targeted by"
    posts ||--o{ notifications   : "targets as post"

    comments ||--o{ reactions    : "receives as comment"
    comments ||--o{ reports      : "targeted by"
    comments ||--o{ notifications: "targets as comment"

    categories ||--o{ post_categories : "applied"

    users {
        INTEGER id PK
        TEXT    username UK
        TEXT    email    UK
        TEXT    password "bcrypt or !unusable"
        TEXT    role     "user|moderator|admin"
        DATETIME created_at
    }

    sessions {
        TEXT    id PK "UUID"
        INTEGER user_id FK
        DATETIME expires_at
        DATETIME last_seen_at
        TEXT    user_agent_hash
        DATETIME created_at
    }

    identities {
        INTEGER id PK
        INTEGER user_id FK
        TEXT    provider "google|github"
        TEXT    provider_user_id
        TEXT    email
        TEXT    display_name
        TEXT    avatar_url
        DATETIME created_at
    }

    posts {
        INTEGER id PK
        TEXT    title
        TEXT    content
        INTEGER user_id FK
        TEXT    status   "approved|pending|rejected"
        DATETIME created_at
        DATETIME updated_at
    }

    comments {
        INTEGER id PK
        TEXT    content
        INTEGER user_id FK
        INTEGER post_id FK
        TEXT    status   "approved|pending|rejected"
        DATETIME created_at
        DATETIME updated_at
    }

    reports {
        INTEGER id PK
        INTEGER reporter_id FK
        TEXT    target_type "post|comment"
        INTEGER target_id
        TEXT    reason
        TEXT    status "open|resolved|dismissed"
        DATETIME created_at
    }

    notifications {
        INTEGER id PK
        INTEGER user_id FK "receiver"
        INTEGER actor_id FK "triggerer"
        TEXT    type "like|comment|reply"
        TEXT    target_type "post|comment"
        INTEGER target_id
        INTEGER is_read
        DATETIME created_at
    }

    activity_logs {
        INTEGER id PK
        INTEGER user_id FK
        TEXT    action "post_create|comment_create|post_edit|comment_edit"
        TEXT    target_type "post|comment"
        INTEGER target_id
        DATETIME created_at
    }

    reactions {
        INTEGER id PK
        INTEGER user_id FK
        TEXT    target_type "post|comment"
        INTEGER target_id
        INTEGER value "-1|1"
        DATETIME created_at
    }

    media {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER post_id FK "nullable"
        TEXT    kind "post_image|avatar"
        TEXT    original_name
        TEXT    mime_type
        INTEGER size_bytes
        INTEGER width
        INTEGER height
        TEXT    storage_path
        TEXT    sha256
        DATETIME created_at
    }

    oauth_states {
        TEXT    state PK
        TEXT    code_verifier
        TEXT    nonce
        TEXT    provider
        TEXT    redirect_to
        INTEGER link_user_id FK "nullable"
        DATETIME expires_at
    }

    categories {
        INTEGER id PK
        TEXT    name UK
    }

    post_categories {
        INTEGER post_id PK,FK
        INTEGER category_id PK,FK
    }

    schema_migrations {
        INTEGER id PK
        TEXT    name UK
        DATETIME applied_at
    }
```

## Table-by-Table Explanations

### Core & Authentication
- **`users`**: Stores local accounts. The `role` column enables RBAC (User, Moderator, Admin). SSO-only users have a password starting with `!`, making local login impossible.
- **`sessions`**: Server-side session store. Includes `last_seen_at` for idle timeouts and `user_agent_hash` to prevent session hijacking (cookie theft).
- **`identities`**: Links external providers (Google, GitHub) to local users. Enables multiple SSO methods per account.
- **`oauth_states`**: Single-use, TTL-bounded store for OAuth `state`, `code_verifier` (PKCE), and `nonce`.

### Community Content
- **`posts` & `comments`**: Core content. The `status` column allows moderators to approve or reject content. The `updated_at` column enables optimistic locking (preventing stale edits).
- **`categories` & `post_categories`**: Many-to-many relationship for subforums.
- **`reactions`**: Unified table for likes/dislikes on both posts and comments.

### Moderation & Advanced Features (F05 & F06)
- **`reports`**: User-generated reports against posts or comments. Moderators can resolve or dismiss them.
- **`notifications`**: Triggered when a user likes or comments on someone else's content. Links an `actor` (who did it) to a `user` (who receives it).
- **`activity_logs`**: Tracks user actions (post creation, edits, comments) for the personal activity feed.

### Media
- **`media`**: Stores uploaded images. Paths are SHA-256 addressed (content-addressed storage). `post_id` is nullable to support standalone avatars.