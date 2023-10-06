export DOCKER_DEFAULT_PLATFORM := "linux/amd64"
GHCR_WEBSITE_IMAGE := "ghcr.io/pathoplexus/website:latest"
GHCR_BACKEND_IMAGE := "ghcr.io/pathoplexus/backend:latest"
export WEBSITE_IMAGE := "pathoplexus-website"
export BACKEND_IMAGE := "pathoplexus-backend"

webdev: (up "backend" "-d")
    cd website && npm i && npm run dev

up target='' daemon='' $WEBSITE_IMAGE=GHCR_WEBSITE_IMAGE $BACKEND_IMAGE=GHCR_BACKEND_IMAGE:
    docker compose up {{target}} {{daemon}}

down target='' $WEBSITE_IMAGE=GHCR_WEBSITE_IMAGE $BACKEND_IMAGE=GHCR_BACKEND_IMAGE:
    docker compose down {{target}}

fresh target='': (down target) (up target)

pull-latest: pull-latest-website pull-latest-backend pull-latest-postgres

pull-latest-website:
    docker pull {{GHCR_WEBSITE_IMAGE}}

pull-latest-backend:
    docker pull {{GHCR_BACKEND_IMAGE}}

pull-latest-postgres:
    docker pull postgres:latest

build-backend-image:
    cd backend && ./gradlew bootBuildImage --imageName=pathoplexus-backend

build-website-image:
    cd website && docker build -t pathoplexus-website .

build-images: build-backend-image build-website-image

build-up: build-images local-down local-up

local-up daemon='': (up "" daemon WEBSITE_IMAGE BACKEND_IMAGE)

local-down: (down "" WEBSITE_IMAGE BACKEND_IMAGE)

backend *kwargs: (up "database" "-d")
    cd backend && ./gradlew bootRun --args='--spring.datasource.url=jdbc:postgresql://localhost:5432/pathoplexus --spring.datasource.username=postgres --spring.datasource.password=unsecure' >> ../log/backend.log {{kwargs}}

vd: (up "database" "-d")
    vd postgresql://postgres:unsecure@localhost:5432/pathoplexus

local-webdev:
    cd website && npm i && npm run dev

local-website-image: (up "backend" "-d") (up "website" "" "pathoplexus-website")
    
