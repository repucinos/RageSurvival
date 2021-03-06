var Equipment = require("./equipment.js")
var MongoDB = require("../libs/mongodb.js")
var Animations = require("./animations.js")
var Storage = require("../world/storage.js")
var PlayerSpawns = require("../world/playerspawns.js")
var Building = require("../world/building.js")
var WeatherManager = require("../world/weather.js")
var Materials = require("../world/materials.js")
var Pickups = require("../world/pickups.js");
var User = MongoDB.getUserModel();
var Inventory = MongoDB.getInventoryModel();
var md5 = require("md5");
var async = require("async");
var values = [];
values["father"] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 42, 43, 44];
values["mother"] = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 45];
const appearanceIndex = {
	"blemishes": 0,
	"facial_hair": 1,
	"eyebrows": 2,
	"ageing": 3,
	"makeup": 4,
	"blush": 5,
	"complexion": 6,
	"sundamage": 7,
	"lipstick": 8,
	"freckles": 9,
	"chesthair": 10
}
var Player = class {
	constructor(player) {
		this._setup(player);
	}
	_setup(player) {
		var self = this;
		self._player = player;
		self._loggedIn = false;
		self._spawnedTimestamp = 0;
		self._inventory = [];
		self._username = "";
		self._playtime = 0;
		self._warns = 0;
		self._userId = 0;
		self._skin = 'mp_m_freemode_01';
		self._gender = "Male";
		self._inCombat = false;
		self._death = 0;
		self._health = 100;
		self._armor = 100;
		self._hunger = 0;
		self._thirst = 0;
		self._storage = {};
		self._canUseItem = Date.now();
		self._characterData = [];
		self._equipment = {};
		self._crouching = false;
		self._position = {
			x: 0,
			y: 0,
			z: 0
		}
		self._tickEvent = new mp.Event("Server:Tick", () => {
			self.tick();
		});
	}
	get crouch() {
		return this._crouching
	}
	set crouch(is) {
		console.log("crouching", is)
		this._crouching = is;
		this._player.setVariable("isCrouched", this._crouching)
	}
	get hunger() {
		return this._hunger;
	}
	get thirst() {
		return this._thirst;
	}
	set armor(a) {
		this._armor = a;
		this._player.armour = this._armor;
	}
	get armor() {
		return this._armor;
	}
	get health() {
		return this._health;
	}
	set health(h) {
		this._health = h;
		this._player.health = 100 + this._health;
	}
	set hunger(h) {
		if (h > 100) h = 100;
		this._hunger = h;
		this._player.setVariable("hunger", this._hunger)
	}
	set thirst(t) {
		if (t > 100) t = 100;
		this._thirst = t;
		this._player.setVariable("thirst", this._thirst)
	}
	tick() {
		if (!this.lastTick) {
			this.lastTick = Date.now();
		}
		let dif = Date.now() - this.lastTick;
		let hUsage = 70 / (60 * 60 * 1000);
		let tUsage = 120 / (60 * 60 * 1000);
		this.hunger = this._hunger - (hUsage * dif);
		this.thirst = this._thirst - (tUsage * dif);
		this.lastTick = Date.now();
	}
	log(...args) {
		console.log("Account:Log", args)
	}
	error(...args) {
		console.error("Account:Error", args)
	}
	set storage(data) {
		this._storage = data;
	}
	get storage() {
		return this._storage;
	}
	get id() {
		return this._userId
	}
	get loggedIn() {
		return this._loggedIn;
	}
	get player() {
		return this._player;
	}
	playAnimSync(dict, name, speed, speedMultiplier, duration, flag, playbackRate, lockX, lockY, lockZ, timeout = 0) {
		let id = this._player.id;
		mp.players.forEachInRange(this._player.position, 200, (tPlayer) => {
			tPlayer.call("Sync:PlayAnimation", [id, dict, name, speed, speedMultiplier, duration, flag, playbackRate, lockX, lockY, lockZ, timeout])
		});
	}
	logout() {
		console.log("DESRTROY");
		mp.events.remove('Server:Tick', this._tickEvent)
	}
	save() {
		let self = this;
		let position = self._player.position;
		return new Promise(function(fulfill, reject) {
			if ((self._loggedIn == true) && (self._player)) {
				User.updateOne({
					user_id: self._userId
				}, {
					warns: self._warns, // Change stuff later
					position: {
						x: position.x,
						y: position.y,
						z: position.z
					},
					hunger: self._hunger,
					thirst: self._thirst,
					health: self.health
				}, function(err, numberAffected, rawResponse) {
					if (!err) {
						self.log("Succesfully saved data", self._username)
						if (self._player) {
							self._player.call("Notifications:New", [{
								title: "Save",
								titleSize: "16px",
								message: "Succesfully saved your Account Data",
								messageColor: 'rgba(0,0,0,.8)',
								position: "bottomRight",
								close: false
							}])
						}
						return fulfill("Succesfully saved data", self._username);
					} else {
						self.error("Account:Save Fail", err)
						return reject("Failed saving player data");
					}
				});
			} else {
				return fulfill("No need to save, not logged in")
			}
		})
	}
	isDead() {
		return this._death;
	}
	Combat() {
		self = this;
		self._inCombat = true;
		if (self._combatTimer) {
			clearTimeout(self._combatTimer);
		}
		self._combatTimer = setTimeout(function() {
			self._inCombat = false;
		}, 2 * 60 * 1000)
	}
	killed(victim, weapon, teamkill) {
		let self = this;
		self._player.call("Notifications:New", [{
			title: "Kill",
			titleSize: "16px",
			message: "You killed " + victim.name + " ( EXP: " + addExp + " )",
			messageColor: 'rgba(0,0,0,.8)',
			position: "bottomCenter",
			close: false
		}])
	}
	death(killer, weapon, reason) {
		let self = this;
		//Building.addTempObject(model, pos, rot, data = {})
		self._position = mp.vector(PlayerSpawns[Math.floor(Math.random() * PlayerSpawns.length)]);
		self._player.call("Player:HideUI");
		setTimeout(function() {
			self.spawn(1);
		}, 1000);
	}
	spawn(fresh = 0) {
		var self = this;
		self._player.spawn(mp.vector(self._position));
		self.loadChar(self._characterData);
		// self._equipment
		/*self._player.call("Inventory:Resize", [10, 10])
		self._player.call("Inventory:Update", [self._inventory])
		console.log(self._inventory);
		mp.events.call("Player:Inventory", self._player, self._inventory)*/
		// console.log("TODO: Relaod inventory in spawn");
		Promise.all([self.loadEquipment((fresh == 0) ? false : self._equipment), self.loadInventory()]).then(() => {
			console.log("Player:UiReady")
			self._player.call("Player:ShowUI");
		}).catch(err => {
			console.log(err);
		})
		console.log("TODO: Relaod equipment in spawn");
		//Player:UiReady
		self._player.heading = 90;
		self.health = self.health;
		self._damage = [];
		self._death = 0;
		self._inCombat = false;
		self._player.setVariable("hunger", self._hunger)
		self._player.setVariable("thirst", self._thirst)
		self._player.setVariable("effects", self._effects)
		self._player.setVariable("spawned", true)
		self._player.setVariable("canGather", true)
		self._player.alpha = 255;
		self._player.call("Cam:Hide")
		self._player.call("Player:Spawn");
		if (fresh == 1) {
			self._player.call("Player:WanderDuration", [1000]);
		}
		self._spawnedTimestamp = Date.now();
	}
	hit(hitter, weapon, bone) {
		var self = this;
		if (self._loggedIn == true) {
			if ((Date.now() - self._spawnedTimestamp) / 1000 > 15) {
				if ((self._health > 0) && (self.isDead() == 0)) {
					let mul = 1;
					//if (bone != undefined) {
					//    mul = Damage.getBoneMul(bone);
					//}
					let damage = 0 // Math.floor(Damage.getWeaponDamage(weapon) * (mul || 1));
					hitter.player.call("Combat:HitEntity")
				} else {
					if ((self.isDead() == 0)) {
						self.death(hitter, weapon);
					}
				}
			}
		}
	}
	async fireWeapon(weapon_id, ammo) {
		var self = this;
		if (weapon_id != 0) {
			let weapon = undefined;
			if (self._equipment["weapon_primary"] != undefined) {
				let e = Equipment[self._equipment["weapon_primary"].name]
				if (weapon_id == mp.joaat(e.hash)) {
					weapon = e;
				}
			}
			if (self._equipment["weapon_secondary"] != undefined) {
				let e = Equipment[self._equipment["weapon_secondary"].name]
				if (weapon_id == mp.joaat(e.hash)) {
					weapon = e;
				}
			}
			if (weapon != undefined) {
				let ammoByType = [];
				let allTypes = self._inventory.filter(e => {
					return e.mask == "Ammo"
				}).map(v => {
					return v.name;
				}).filter(function(value, index, self) {
					return self.indexOf(value) === index;
				});
				allTypes.forEach(function(name) {
					let ammo = self._inventory.filter(function(k) {
						return k.name == name;
					})
					ammoByType[name] = ammo.reduce(function(acc, c) {
						return acc + c.amount;
					}, 0);
				})
				let totalAmmo = ammoByType[weapon.ammo];
				console.log("ammo", totalAmmo);
				console.log("ammo1", ammo);
			} else {
				console.log("Weapon Chat Detected");
			}
		}
	}
	manageAttachments(oWeapon, nWeapon) {
		let self = this;
		if (self._loggedIn == true) {
			if ((Date.now() - self._spawnedTimestamp) / 1000 > 1) {
				console.log("nWeapon", nWeapon);
				console.log("oWeapon", oWeapon);
				if (nWeapon == undefined) {
					nWeapon = self._player.weapon;
				}
				if (!self._attachments) {
					self._attachments = {};
				}
				/* Weapon Attachments */
				if (self._equipment["weapon_primary"] != undefined) {
					let e = Equipment[self._equipment["weapon_primary"].name]
					if (nWeapon != mp.joaat(e.hash)) {
						self._player.addAttachment(e.hash, false);
						self._attachments["primary"] = e.hash
					} else {
						self._player.addAttachment(e.hash, true);
						self._attachments["primary"] = undefined;
					}
				} else if (self._attachments["primary"] != undefined) {
					self._player.addAttachment(self._attachments["primary"], true);
					self._attachments["primary"] = undefined;
				}
				if (self._equipment["weapon_secondary"] != undefined) {
					let e = Equipment[self._equipment["weapon_secondary"].name]
					if (nWeapon != mp.joaat(e.hash)) {
						self._player.addAttachment(e.hash, false);
						self._attachments["secondary"] = e.hash
					} else {
						self._player.addAttachment(e.hash, true);
						self._attachments["secondary"] = undefined
					}
				} else if (self._attachments["secondary"] != undefined) {
					self._player.addAttachment(self._attachments["secondary"], true);
					self._attachments["secondary"] = undefined;
				}
				if (self._equipment["weapon_melee"] != undefined) {
					let e = Equipment[self._equipment["weapon_melee"].name]
					if (nWeapon != mp.joaat(e.hash)) {
						self._player.addAttachment(e.hash, false);
						self._attachments["melee"] = e.hash
					} else {
						self._player.addAttachment(e.hash, true);
						self._attachments["melee"] = undefined
					}
				} else if (self._attachments["melee"] != undefined) {
					self._player.addAttachment(self._attachments["melee"], true);
					self._attachments["melee"] = undefined;
				}
				/*Clothing Attachments*/
			}
		}
	}
	gather(material) {
		var self = this;
		if (self._player.getVariable("canGather") == true) {
			self._player.setVariable("canGather", false);
			console.log("gather material", material, Materials[material]);
			let temp_weapon = self._player.weapon;
			let temp_weaponAmmo = self._player.weaponAmmo;
			if (temp_weapon) {
				self._player.removeWeapon(temp_weapon);
			}
			let attachments = ""
			if (Materials[material] == "Tree") {
				self.playAnimSync(Animations.getAnim("Mining").dict, Animations.getAnim("Mining").name, 16.0, 1, -1, 1, 1.0, false, false, false, 1000);
				attachments = "lumberjack"
			}
			if ((Materials[material] == "Stone") || (Materials[material] == "Mineral Stone")) {
				//self._player.playAnimation(animations.gather.stone.dict, animations.gather.stone.anim, 2.0, (1))
				self.playAnimSync(Animations.getAnim("Mining").dict, Animations.getAnim("Mining").name, 16.0, 1, -1, 1, 1.0, false, false, false, 1000);
				attachments = "mining"
			}
			if (attachments != "") {
				self._player.addAttachment(attachments, false);
			}
			setTimeout(function() {
				//self._player.stopAnimation();
				self._player.setVariable("canGather", true);
				self._player.addAttachment(attachments, true);
				if (temp_weapon) {
					self._player.giveWeapon(temp_weapon, temp_weaponAmmo);
				}
				console.log("TODO Give Item after Gather!!!");
			}, 4000)
		}
	}
	/*Attachments*/
	getInventoryItemByIndex(index = 0) {
		return this._inventory[index];
	}
	getInventory() {
		return this._inventory;
	}
	getEquipment() {
		console.log("getEquipment");
		return this._equipment;
	}
	reloadInventory() {
		this._inventory = [];
		this.loadInventory();
	}
	reloadEquipment() {
		this._equipment = {};
		this.loadEquipment();
	}
	/*Apply Equiment*/
	applyEquiment() {
		let self = this;
		let ammoByType = {};
		let allTypes = self._inventory.filter(e => {
			return e.mask == "Ammo"
		}).map(v => {
			return v.name;
		}).filter(function(value, index, self) {
			return self.indexOf(value) === index;
		});
		allTypes.forEach(function(name) {
			let ammo = self._inventory.filter(function(k) {
				return k.name == name;
			})
			ammoByType[name] = ammo.reduce(function(acc, c) {
				return acc + c.amount;
			}, 0);
		})
		self._player.removeAllWeapons();
		if (self._equipment["weapon_primary"] != undefined) {
			let e = Equipment[self._equipment["weapon_primary"].name]
			self._player.giveWeapon(mp.joaat(e.hash), ammoByType[e.ammo]);
		}
		if (self._equipment["weapon_secondary"] != undefined) {
			let e = Equipment[self._equipment["weapon_secondary"].name]
			self._player.giveWeapon(mp.joaat(e.hash), ammoByType[e.ammo]);
		}
		if (self._equipment["weapon_melee"] != undefined) {
			let e = Equipment[self._equipment["weapon_melee"].name]
			if (e) {
				self._player.giveWeapon(mp.joaat(e.hash), 1);
			}
			if (self._equipment["weapon_melee"].name == "Hatchet") {
				self._player.setVariable("hasHatchet", true);
			} else {
				self._player.setVariable("hasHatchet", false);
			}
			if (self._equipment["weapon_melee"].name == "Pickaxe") {
				self._player.setVariable("hasPickaxe", true);
			} else {
				self._player.setVariable("hasPickaxe", false);
			}
		} else {
			self._player.setVariable("hasPickaxe", false);
			self._player.setVariable("hasHatchet", false);
		}
		console.log("self._equipment", self._equipment)
		console.log("ammoByType", ammoByType);
		console.log(self._equipment["bag"])
		if (self._equipment["bag"] != undefined) {
			let e = Equipment[self._equipment["bag"].name]
			if (e) {
				self._player.setClothes(5, e.drawable, 0, 2);
				self._player.call("Inventory:Resize", [e.w, e.h])
			}
		} else {
			self._player.setClothes(5, 0, 0, 1);
			self._player.call("Inventory:Resize", [10, 10])
		}
		if (self._equipment["armor"] != undefined) {
			let e = Equipment[self._equipment["armor"].name]
			let dur = self._equipment["armor"].data["durability"];
			console.log("eq", self._equipment["armor"]);
			console.log("dur", dur);
			if (e) {
				let drawable = e.drawable[self._gender];
				console.log("drawable", drawable);
				self._player.setClothes(9, drawable, 0, 4);
				console.log("dur",dur);
				self.armor = parseInt(dur);
			}
		} else {
			self._player.setClothes(9, 0, 0, 1);
				self.armor = 0;
		}
		self.manageAttachments(false)
	}
	/* Equipment */
	async loadEquipment(data = false) {
		let self = this;
		return new Promise(async (resolve, reject) => {
			let loadData = [];
			let update = false;
			console.log("data", data);
			setImmediate(async () => {
				if (data != false) {
					loadData = data;
				} else {
					try {
						let dbEquipment = await User.find({
							name: self._username
						});
						loadData = dbEquipment[0].equipment;
						console.log("loaded eq", dbEquipment);
						update = true;
					} catch (err) {
						console.log("loadEquipment async err", err);
						return reject(err);
					}
				}
				console.log("loadData", loadData);
				if (update == true) {
					let items = [];
					Object.keys(loadData).forEach(function(key, value) {
						let item = loadData[key];
						let itemData = Storage.map({
							name: item.name,
							amount: item.amount,
							data: item.data,
							slot_id: key
						});
						items.push(itemData);
					});
					self._player.call("Storage:UpdateSlots", ["equipment", items])
				}
				self._equipment = loadData;
				self.applyEquiment();
				return resolve();
			});
		})
	}
	/* Inventory */
	async loadInventory() {
		let self = this;
		return new Promise(async (resolve, reject) => {
			setImmediate(async () => {
				Inventory.find({
					owner_type: "player",
					owner_id: self._userId
				}, async function(err, arr) {
					if (err) return reject(err);
					if (arr != undefined) {
						let cInventory = arr;
						self._inventory = cInventory.map(function(item, i) {
							let itemData = Storage.map({
								id: item._id,
								name: item.name,
								amount: item.amount,
								data: item.data
							});
							return itemData;
						});
						self._player.call("Inventory:Update", [self._inventory])
						mp.events.call("Player:Inventory", self._player, self._inventory)
						console.log("Loaded Player Inventory",self._inventory);
						return resolve();
					} else {
						self.error("Account:Inventory", "Failed loading player inventory")
						return reject("Failed loading player inventory");
					}
				}).lean()
			});
		});
	}
	async setEquipment(obj) {
		let self = this;
		let eq = {};
		obj.forEach(function(item) {
			console.log("setEQ",item);
			eq[item.slot_id] = {
				id:item.id,
				name: item.name,
				amount: item.amount,
				data: item.data || {}
			}
		})
		try {
			setImmediate(async () => {
				let save = await User.updateOne({
					user_id: self._userId
				}, {
					equipment: eq
				});
				self.loadEquipment(eq);
			});
		} catch (err) {
			console.log("err setEquipment", err);
		}
	}
	async doAction(action, item_id) {
		let self = this;
		console.log("action on Item", action, item_id);
		let item_index = this.getInventory().findIndex(e => e.id == item_id)
		if (item_index > -1) {
			if ((Date.now() - self._canUseItem) < 5000) return;
			let item = this.getInventoryItemByIndex(item_index);
			console.log("item exists", item_id, "index", item_index, "item", item);
			action = action.toLowerCase().trim();
			let pos = this._player.position;
			let iData = Storage.getItemData(item.name);
			self._canUseItem = Date.now();
			switch (action) {
				case "drop":
					self.removeItem(item.id);
					self._player.call("Notifications:New", [{
						title: "Item",
						titleSize: "16px",
						message: "You just dropped " + item.name,
						messageColor: 'rgba(0,0,0,.8)',
						position: "bottomRight",
						close: false
					}])
					Pickups.dropItem(item, pos.x, pos.y, pos.z);
					self.playAnimSync(Animations.getAnim("Drop").dict, Animations.getAnim("Drop").name, 8.0, 1, -1, 49, 1.0, false, false, false, 1000);
					break;
				case "build":
					//let pos = this._player.position;
					self.removeItem(item.id);
					Pickups.dropItem(item, pos.x, pos.y, pos.z);
					break;
				case "eat":
					//let pos = this._player.position;
					self._player.addAttachment("eat_burger", false);
					self.playAnimSync(Animations.getAnim("Eating").dict, Animations.getAnim("Eating").name, 8.0, 1, -1, 49, 1.0, false, false, false, 5000);
					setTimeout(function() {
						self._player.addAttachment("eat_burger", true);
						self.hunger += iData.hunger;
					}, 5000);
					self.removeItem(item.id, 1);
					break;
				case "drink":
					self._player.addAttachment("drink_beer", false);
					self.playAnimSync(Animations.getAnim("Drinking").dict, Animations.getAnim("Drinking").name, 8.0, 1, -1, 49, 1.0, false, false, false, 5000);
					setTimeout(function() {
						self._player.addAttachment("drink_beer", true);
						self.thirst += iData.thirst;
					}, 5000);
					self.removeItem(item.id, 1);
					break;
				default:
					console.log("default switch action", action, item_id)
			}
		}
	}
	useItem(item_data) {
		console.log("use Item", item_data);
		//this._player.playScenario("CODE_HUMAN_PARK_CAR")
	}
	setInventory(arr) {
		this._inventory = arr.map(function(item, i) {
			let itemData = Storage.map({
				id: item.id,
				name: item.name,
				amount: item.amount,
				data: item.data
			});
			return itemData;
		});
	}
	hasItem(name) {
		let index = this._inventory.findIndex(function(item) {
			return (item.name == name);
		})
		return index > -1 ? this._inventory[index] : false;
	}
	hasSpaceInItemStack(name) {
		let stack = Storage.getMaxStack(name);
		let index = this._inventory.findIndex(function(item) {
			return (item.name == name) && (item.amount < stack);
		})
		return index > -1 ? this._inventory[index] : false;
	}
	async giveItem(item, sub = false) {
		let self = this;
		return new Promise(async function(resolve, reject) {
			try {
				var hasItem = self.hasItem(item.name);
				console.log("hasItem", hasItem);
				console.log("giveItem", item);
				setImmediate(async () => {
					let dbItem = await new Inventory({
						owner_id: self._userId,
						name: item.name,
						amount: item.amount,
						data: item.data
					}).save();
					let itemData = Storage.map({
						id: dbItem._id,
						name: dbItem.name,
						amount: dbItem.amount,
						data: dbItem.data
					});
					self._inventory.push(itemData);
					console.log("itemData", itemData);
					mp.events.call("Player:Inventory:AddItem", self._player, itemData)
					self._player.call("Inventory:AddItem", [itemData])
					return resolve();
				});
			} catch (err) {
				return reject(err);
			}
		})
	}
	async removeItem(id, amount) {
		let self = this;
		console.log("remove item", id);
		let index = self._inventory.findIndex(function(item) {
			return (item.id == id);
		})
		if (index > -1) {
			if (!amount) {
				console.log("removed");
				delete self._inventory[index];
				self._inventory.splice(index, 1)
				setImmediate(async () => {
					let removed = await Inventory.deleteOne({
						_id: id
					});
					if (removed.ok == 1) {
						console.log("removed1 ");
						self._player.call("Inventory:RemoveItem", [id])
					} else {
						console.log("remove failed");
					}
				})
			} else {
				let cAmount = self._inventory[index].amount;
				let nAmount = cAmount - amount;
				if (nAmount > 0) {
					setImmediate(async () => {
						let inv_update = await Inventory.updateOne({
							_id: id
						}, {
							amount: nAmount
						})
						if (inv_update.ok == 1) {
							console.log("updated ok ");
							self._player.call("Inventory:EditItem", [id, {
								amount: nAmount
							}])
						} else {
							console.log("updated failed");
						}
					})
				} else {
					self.removeItem(id)
				}
			}
		}
		console.log("index item", index);
	}
	/* Inventory */
	/*Character*/
	saveChar(data) {
		let self = this;
		User.updateOne({
			user_id: self._userId
		}, {
			character: JSON.parse(data)
		}, function(err, numberAffected, rawResponse) {
			if (!err) {
				self.log("Succesfully created Character", self._username)
				if (self._player) {
					self._player.call("Notifications:New", [{
						title: "Save",
						titleSize: "16px",
						message: "Saved Character",
						messageColor: 'rgba(0,0,0,.8)',
						position: "bottomCenter",
						close: false
					}])
					self._characterData = JSON.parse(data);
					self.load(self._username, 1);
				}
				return fulfill("Succesfully saved data", self._username);
			} else {
				self.error("Account:Save Fail", err)
				return reject("Failed saving player data");
			}
		});
	}
	loadChar(data) {
		let self = this;
		self._gender = data.gender;
		if (data.gender == "Male") {
			self._player.model = mp.joaat('mp_m_freemode_01');
			self._player.setClothes(3, 0, 0, 2);
			self._player.setClothes(4, 102, 0, 2);
			self._player.setClothes(6, 34, 0, 2);
			self._player.setClothes(8, 15, 0, 2);
			self._player.setClothes(11, 34, 0, 2);
			//self._player.setClothes(5, 40, 0, 2);
		} else {
			self._player.model = mp.joaat('mp_f_freemode_01');
			self._player.setClothes(3, 14, 0, 2);
			self._player.setClothes(4, 110, 0, 2);
			self._player.setClothes(6, 35, 0, 2);
			self._player.setClothes(8, 15, 0, 2);
			self._player.setClothes(11, 49, 0, 2);
			//self._player.setClothes(5, 40, 0, 2);
		}
		/*appearanceIndex*/
		if (data.makeup) {
			let index = appearanceIndex["makeup"];
			let overlayID = (data.makeup == 0) ? 255 : data.makeup - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.makeup_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		if (data.ageing) {
			let index = appearanceIndex["ageing"];
			let overlayID = (data.ageing == 0) ? 255 : data.ageing - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.ageing_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		if (data.blemishes) {
			let index = appearanceIndex["blemishes"];
			let overlayID = (data.blemishes == 0) ? 255 : data.blemishes - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.blemishes_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		if (data.facial_hair) {
			let index = appearanceIndex["facial_hair"];
			let overlayID = (data.facial_hair == 0) ? 255 : data.facial_hair - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.facial_hair_opacity) * 0.01, data.facial_hair_color /*ColorOverlay*/ , 0]);
		}
		if (data.eyebrows) {
			let index = appearanceIndex["eyebrows"];
			let overlayID = (data.eyebrows == 0) ? 255 : data.eyebrows - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.eyebrows_opacity) * 0.01, data.eyebrows_color /*ColorOverlay*/ , 0]);
		}
		if (data.blush) {
			let index = appearanceIndex["blush"];
			let overlayID = (data.blush == 0) ? 255 : data.blush - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.blush_opacity) * 0.01, data.blush_color /*ColorOverlay*/ , 0]);
		}
		if (data.complexion) {
			let index = appearanceIndex["complexion"];
			let overlayID = (data.complexion == 0) ? 255 : data.complexion - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.complexion_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		if (data.lipstick) {
			let index = appearanceIndex["lipstick"];
			let overlayID = (data.lipstick == 0) ? 255 : data.lipstick - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.lipstick_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		if (data.freckles) {
			let index = appearanceIndex["freckles"];
			let overlayID = (data.freckles == 0) ? 255 : data.freckles - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.freckles_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		if (data.chesthair) {
			let index = appearanceIndex["chesthair"];
			let overlayID = (data.chesthair == 0) ? 255 : data.chesthair - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.chesthair_opacity) * 0.01, data.chesthair_color /*ColorOverlay*/ , 0]);
		}
		if (data.sundamage) {
			let index = appearanceIndex["sundamage"];
			let overlayID = (data.sundamage == 0) ? 255 : data.sundamage - 1;
			self._player.setHeadOverlay(index, [overlayID, /*Opacity*/ parseInt(data.sundamage_opacity) * 0.01, 0 /*ColorOverlay*/ , 0]);
		}
		data.facial.forEach(function(feature, i) {
			self._player.setFaceFeature(parseInt(feature.index), parseFloat(feature.val) * 0.01);
		})
		if (data.hair != undefined) {
			self._player.setClothes(2, data.hair, 0, 2);
			self._player.setHairColor(data.hair_color, data.hair_highlight_color);
			// self._player.setEyeColor(data.eyeColor);
			self._player.eyeColor = parseInt(data.eyeColor);
			/*self._player.setHeadOverlayColor(1, 1, data.facial_hair_color, 0);
			self._player.setHeadOverlayColor(2, 1, data.eyebrows_color, 0);
			self._player.setHeadOverlayColor(5, 2, data.blush_color, 0);
			self._player.setHeadOverlayColor(8, 2, data.lipstick, 0);
			self._player.setHeadOverlayColor(10, 1, data.chesthair_color, 0);*/
		}
		if ((data.fatherIndex != undefined) && (data.motherIndex != undefined) && (data.tone != undefined) && (data.resemblance != undefined)) {
			self._player.setHeadBlend(
				// shape
				values["mother"][data.motherIndex], values["father"][data.fatherIndex], 0,
				// skin
				values["mother"][data.motherIndex], values["father"][data.fatherIndex], 0,
				// mixes
				data.resemblance * 0.01, data.tone * 0.01, 0.0);
		}
	}
	load(username, fresh = 0) {
		var self = this;
		self._username = username;
		self._player.call("Account:HideLogin")
		self._loggedIn = true;
		User.find({
			name: self._username
		}, async function(err, arr) {
			if (arr.length) {
				let cUser = arr[0];
				self._playtime = cUser.playtime;
				self._warns = cUser.warns;
				self._userId = cUser.user_id;
				self._position = cUser.position;
				self._player.name = self._username;
				self._equipment = cUser.equipment || {};
				if ((cUser.character) && (cUser.character.length > 0)) {
					self._characterData = cUser.character[0];
					self.hunger = cUser.hunger || 100;
					self.thirst = cUser.thirst || 100;
					self.health = cUser.health || 100;

					self._player.setVariable("user_id", self._userId);
					self._player.setVariable("loggedIn", true);
					self._player.setVariable("spawned", false);
					self._player.call("Account:LoginDone");
					WeatherManager.call(self._player);
					Animations.send(self._player);
					self.log("loaded player data for", self._player.name)
					console.log(self._player)
					mp.events.call("Player:Loaded", self._player)
					self.spawn(fresh);
				} else {
					self._player.call("Character:Start")
				}
			} else {
				self.error("Account:Load", "Failed loading player data")
			}
		}).lean()
	}
	register(name, password_hash, salt) {
		var self = this;
		User.find({
			name: name
		}, async function(err, arr) {
			if (err) return console.log("error", err);
			if ((arr) && (arr.length)) {
				self._player.call("Account:Alert", ["Username already exsits"])
			} else {
				let hwid = self._player.serial
				let social_club = self._player.socialClub;
				let hash = password_hash;
				let position = PlayerSpawns[Math.floor(Math.random() * PlayerSpawns.length)]
				let UserCount = await User.find({});
				User.create({
					user_id: UserCount.length,
					name: name,
					hwid: hwid,
					social_clib: social_club,
					password: password_hash,
					salt: salt,
					position: {
						x: position.x,
						y: position.y,
						z: position.z
					}
				}, function(err, rV) {
					if (err) {
						self._player.call("Account:Alert", ["Username already exsits"])
						return console.log(err)
					};
					console.log("account created")
					self.load(name);
					// saved!
				});
			}
		});
	}
	login(username, password) {
		var self = this;
		self.log("Login request")
		User.find({
			name: username
		}, async function(err, arr) {
			if (arr.length) {
				let lUser = arr[0];
				let hash = md5(password + "|" + lUser.salt);
				if (hash == lUser.password) {
					self.load(username)
				} else {
					self.error("Account:Alert", "Password Wrong")
					self._player.call("Account:Alert", ["Password Wrong"])
				}
			} else {
				console.log("Account:Alert", "Account does not exists")
				self._player.call("Account:Alert", ["Account does not exists"])
			}
		});
	}
}
mp.events.addCommand("nox", async function(player, fulltext) {
	let start = new Date();
	let dbEquipment = await User.find();
	let end = new Date();
	console.log("response time", (end - start))
});
module.exports = Player;