const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

const pyramidGroup = new THREE.Group();
scene.add(pyramidGroup);

const textureLoader = new THREE.TextureLoader();
const selectSound = new Audio('https://cdn.freesound.org/previews/237/237422_4284968-lq.ogg');
const removeSound = new Audio('https://cdn.freesound.org/previews/545/545338_12183728-lq.ogg');
selectSound.onerror = () => console.warn('Failed to load select sound');
removeSound.onerror = () => console.warn('Failed to load remove sound');

// Уровни сложности
const difficultyLevels = {
    easy: { baseWidth: 6, minTopWidth: 2, levels: 3, textureCount: 4 },
    medium: { baseWidth: 8, minTopWidth: 2, levels: 4, textureCount: 5 },
    hard: { baseWidth: 10, minTopWidth: 2, levels: 5, textureCount: 6 }
};

let config = {
    tileSize: 1,
    rotationSpeed: 0.05,
    zoomSpeed: 0.5,
    minZoom: 5,
    maxZoom: 30,
    ...difficultyLevels.medium // По умолчанию средняя сложность
};

const tiles = [];
let selectedTiles = [];
let score = 0;
let pyramidRotationY = 0;
let pyramidRotationX = 0;
let levelWidths = [];
let totalTiles = 0;
let pairsNeeded = 0;
const textureAssignments = [];
const materialCache = new Map();
const pyramidState = new Map();

function updateDifficulty(difficulty) {
    config = { ...config, ...difficultyLevels[difficulty] };
    levelWidths = [];
    for (let i = 0; i < config.levels; i++) {
        const width = config.baseWidth - (i * 2);
        levelWidths.push(i === config.levels - 1 && width < config.minTopWidth ? config.minTopWidth : width);
    }
    totalTiles = levelWidths.reduce((sum, width) => sum + width * width, 0);
    pairsNeeded = totalTiles / 2;
}

const texturePromises = [];
for (let i = 0; i < Math.max(...Object.values(difficultyLevels).map(d => d.textureCount)); i++) {
    const path = `textures/tile_${i}.jpg`;
    const promise = new Promise((resolve) => {
        const texture = textureLoader.load(path, () => resolve(texture), undefined, (error) => {
            console.error('Texture loading error:', error);
            resolve(null);
        });
    });
    texturePromises.push(promise);
}

Promise.all(texturePromises).then((textures) => {
    textures.forEach((texture, i) => {
        const path = `textures/tile_${i}.jpg`;
        const material = texture
            ? new THREE.MeshStandardMaterial({ map: texture, emissive: 0x000000 })
            : new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x000000 });
        materialCache.set(path, material);
    });

    function initializeGame() {
        textureAssignments.length = 0;
        pyramidState.clear();
        for (let i = 0; i < pairsNeeded; i++) {
            const path = `textures/tile_${i % config.textureCount}.jpg`;
            textureAssignments.push(materialCache.get(path));
            textureAssignments.push(materialCache.get(path));
        }
        for (let i = textureAssignments.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [textureAssignments[i], textureAssignments[j]] = [textureAssignments[j], textureAssignments[i]];
        }

        let tileIndex = 0;
        for (let level = 0; level < config.levels; level++) {
            const width = levelWidths[level];
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < width; y++) {
                    const key = `${level},${x},${y}`;
                    pyramidState.set(key, { material: textureAssignments[tileIndex], exists: true });
                    tileIndex++;
                }
            }
        }

        createPyramid();
        updateTileAvailability();
        updateScore();
    }

    // UI элементы
    const menuContainer = document.createElement('div');
    menuContainer.classList.add('menu'); 
    document.body.appendChild(menuContainer);       
    if (!document.getElementById('score')) {
    

        const newGameBtn = document.createElement('button');
        newGameBtn.id = 'new-game';
        newGameBtn.innerText = 'Новая игра';
        newGameBtn.classList.add('btn', 'new-game');
        menuContainer.appendChild(newGameBtn);

        const hintBtn = document.createElement('button');
        hintBtn.id = 'hint';
        hintBtn.innerText = 'Подсказка';
        hintBtn.classList.add('btn', 'hint');
        menuContainer.appendChild(hintBtn);

        const scoreDiv = document.createElement('div');
        scoreDiv.classList.add('score');
        scoreDiv.id = 'score';  
        menuContainer.appendChild(scoreDiv);
       

        // Добавляем кнопки выбора сложности
        const difficultyContainer = document.createElement('div');
        difficultyContainer.classList.add('difficulty');   

        ['easy', 'medium', 'hard'].forEach((level, index) => {
            const btn = document.createElement('button');
            btn.classList.add('btn', 'difficulty-btn');
            btn.innerText = level.charAt(0).toUpperCase() + level.slice(1); 
            btn.addEventListener('click', () => {
                updateDifficulty(level);
                initializeGame();
            });
            difficultyContainer.appendChild(btn);
        });      
        document.body.appendChild(difficultyContainer);       
    }

    function createPyramid() {
        while (pyramidGroup.children.length > 0) {
            pyramidGroup.remove(pyramidGroup.children[0]);
        }
        tiles.length = 0;

        for (let level = 0; level < config.levels; level++) {
            const width = levelWidths[level];
            const offset = (config.baseWidth * config.tileSize) / 2 - (config.tileSize / 2);
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < width; y++) {
                    const key = `${level},${x},${y}`;
                    const state = pyramidState.get(key);
                    if (state.exists) {
                        const geometry = new THREE.BoxGeometry(config.tileSize, 0.3, config.tileSize);
                        const material = state.material.clone();
                        const tile = new THREE.Mesh(geometry, material);
                        tile.position.set(
                            x * config.tileSize - offset + (config.baseWidth - width) * config.tileSize / 2,
                            level * 0.3,
                            y * config.tileSize - offset + (config.baseWidth - width) * config.tileSize / 2
                        );
                        tile.userData = { level, x, y, available: true, material: state.material };
                        tiles.push(tile);
                        pyramidGroup.add(tile);
                    }
                }
            }
        }
        pyramidGroup.position.set(0, 0, 0);
    }

    function isTileAvailable(tile) {
        const { level, x, y } = tile.userData;
        if (level === config.levels - 1) return true;
        const blockedAbove = tiles.some(t => {
            const { level: tLevel, x: tX, y: tY } = t.userData;
            return tLevel > level && Math.abs(tX - x) <= 1 && Math.abs(tY - y) <= 1;
        });
        if (blockedAbove) return false;
        const width = levelWidths[level];
        const freeLeft = x === 0 || !tiles.some(t => t.userData.level === level && t.userData.x === x - 1 && t.userData.y === y);
        const freeRight = x === width - 1 || !tiles.some(t => t.userData.level === level && t.userData.x === x + 1 && t.userData.y === y);
        return freeLeft || freeRight;
    }

    let availableTiles = [];
    function updateTileAvailability() {
        availableTiles = tiles.filter(tile => isTileAvailable(tile));
        tiles.forEach(tile => tile.userData.available = availableTiles.includes(tile));
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('click', (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(tiles);
        if (intersects.length > 0) {
            const clickedTile = intersects[0].object;
            if (!clickedTile.userData.available) return;
            const index = selectedTiles.indexOf(clickedTile);
            if (index !== -1) {
                selectedTiles.splice(index, 1);
                clickedTile.material.emissive.set(0x000000);
                return;
            }
            if (selectedTiles.length < 2) {
                selectSound.play().catch(e => console.error('Audio error:', e));
                selectedTiles.push(clickedTile);
                clickedTile.material.emissive.set(0xffff00);
            }
            if (selectedTiles.length === 2) {
                checkMatch();
            }
        }
    });

    function checkMatch() {
        if (selectedTiles.length !== 2) return;
        const [tile1, tile2] = selectedTiles;
        if (tile1.userData.material === tile2.userData.material) {
            removeSound.play().catch(e => console.error('Audio error:', e));
            pyramidGroup.remove(tile1, tile2);
            tiles.splice(tiles.indexOf(tile1), 1);
            tiles.splice(tiles.indexOf(tile2), 1);
            pyramidState.get(`${tile1.userData.level},${tile1.userData.x},${tile1.userData.y}`).exists = false;
            pyramidState.get(`${tile2.userData.level},${tile2.userData.x},${tile2.userData.y}`).exists = false;
            score += 1;
            updateScore();
            updateTileAvailability();
            checkGameOver();
        } else {
            tile1.material.emissive.set(0x000000);
            tile2.material.emissive.set(0x000000);
        }
        selectedTiles = [];
    }

    function updateScore() {
        const scoreElement = document.getElementById('score');

        if (scoreElement) scoreElement.innerText = `Счёт: ${score}`;
    }

    document.getElementById('new-game').addEventListener('click', () => {
        tiles.length = 0;
        selectedTiles.length = 0;
        score = 0;
        pyramidRotationX = 0;
        pyramidRotationY = 0;
        pyramidState.forEach(state => state.exists = true);
        createPyramid();
        updateTileAvailability();
        updateScore();
    });

    function findHint() {
        const materialMap = new Map();
        for (const tile of availableTiles) {
            const material = tile.userData.material;
            if (materialMap.has(material)) return [materialMap.get(material), tile];
            materialMap.set(material, tile);
        }
        return null;
    }

    function highlightHintTiles(tile1, tile2) {
        tile1.material.emissive.set(0x00ff00);
        tile2.material.emissive.set(0x00ff00);
        setTimeout(() => {
            tile1.material.emissive.set(0x000000);
            tile2.material.emissive.set(0x000000);
        }, 2000);
    }

    let hintCount = 3;
    const hintCooldown = 5000;
    let lastHintTime = 0;

    document.getElementById('hint').addEventListener('click', () => {
        const now = Date.now();
        if (hintCount <= 0) {
            alert('Подсказки закончились!');
            return;
        }
        if (now - lastHintTime < hintCooldown) {
            alert(`Подождите ${Math.ceil((hintCooldown - (now - lastHintTime)) / 1000)} сек. до следующей подсказки!`);
            return;
        }
        const hint = findHint();
        if (hint) {
            highlightHintTiles(hint[0], hint[1]);
            hintCount--;
            lastHintTime = now;
            console.log(`Осталось подсказок: ${hintCount}`);
        } else {
            alert('Нет доступных подсказок!');
        }
    });

    function checkGameOver() {
        const available = tiles.filter(tile => tile.userData.available);
        if (tiles.length === 0) {
            setTimeout(() => alert('Поздравляем! Вы выиграли!'), 500);
        } else if (available.length > 0 && !findHint()) {
            setTimeout(() => alert('Игра окончена! Больше нет доступных ходов.'), 500);
        }
    }

    let rotationVelocityX = 0;
    let rotationVelocityY = 0;
    const friction = 0.95;
    let isDragging = false;
    let previousMouseX = 0;
    let previousMouseY = 0;

    window.addEventListener('keydown', (event) => {
        switch (event.key) {
            case 'ArrowLeft': rotationVelocityY += config.rotationSpeed; break;
            case 'ArrowRight': rotationVelocityY -= config.rotationSpeed; break;
            case 'ArrowUp': rotationVelocityX += config.rotationSpeed; break;
            case 'ArrowDown': rotationVelocityX -= config.rotationSpeed; break;
            case 'r':
            case 'R':
                pyramidRotationX = 0;
                pyramidRotationY = 0;
                rotationVelocityX = 0;
                rotationVelocityY = 0;
                break;
        }
    });

    window.addEventListener('mousedown', (event) => {
        isDragging = true;
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    });

    window.addEventListener('mousemove', (event) => {
        if (isDragging) {
            const deltaX = event.clientX - previousMouseX;
            const deltaY = event.clientY - previousMouseY;
            pyramidRotationY += deltaX * config.rotationSpeed * 0.1;
            pyramidRotationX += deltaY * config.rotationSpeed * 0.1;
            pyramidRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pyramidRotationX));
            previousMouseX = event.clientX;
            previousMouseY = event.clientY;
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    window.addEventListener('wheel', (event) => {
        event.preventDefault();
        const zoomDirection = event.deltaY > 0 ? 1 : -1;
        camera.position.z += zoomDirection * config.zoomSpeed;
        camera.position.z = Math.max(config.minZoom, Math.min(config.maxZoom, camera.position.z));
        camera.lookAt(0, 0, 0);
    }, { passive: false });

    function animate() {
        requestAnimationFrame(animate);
        pyramidRotationY += rotationVelocityY;
        pyramidRotationX += rotationVelocityX;
        pyramidRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pyramidRotationX));
        pyramidGroup.rotation.y = pyramidRotationY;
        pyramidGroup.rotation.x = pyramidRotationX;
        rotationVelocityX *= friction;
        rotationVelocityY *= friction;
        renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    updateDifficulty('medium'); // Устанавливаем начальную сложность
    initializeGame();
    animate();
});