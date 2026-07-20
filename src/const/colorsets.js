export const COLORSETS = {
	'coin_default': {
		name: 'Gold Coin',
		description: 'Gold Dragonhead Coin',
		category: 'Other',
		foreground: '#4A3400',
		background: '#f6c928',
		outline: 'black',
		texture: 'metal'
	},
	'coin_silver': {
		name: 'Silver Coin',
		description: 'Silver Dragonhead Coin',
		category: 'Other',
		foreground: '#000000',
		background: ['#A8ADB2','#C7CCD1','#E4E7E9'],
		outline: '#2A2E31',
		texture: 'metal'
	},
	'radiant': {
		name: 'Radiant',
		category: 'Damage Types',
		foreground: '#4A2E00',
		background: ['#FFF3D6','#FFE39A','#FFC94D'],
		outline: '#3D2600',
		edge: '#B8860B',
		texture: 'paper',
		description: 'Radiant'
	},
	'fire': {
		name: 'Fire',
		category: 'Damage Types',
		foreground: '#FFF3B0',
		background: ['#7A1400','#9C2500','#B33000'],
		outline: '#2B0A00',
		edge: '#FF7A00',
		texture: 'fire',
		description: 'Fire'
	},
	'ice': {
		name: 'Ice',
		category: 'Damage Types',
		foreground: '#062B3D',
		background: ['#EAFBFF','#CDEFFB','#AEE3F5','#8FD4EE','#6FC3E8'],
		// dark outline (matching sibling pale-body sets air/earth/radiant) so fill+outline
		// read as one solid dark glyph; a light/white outline nearly matches this set's own
		// pale body and let the thin dark numeral wash out to illegible on small d20 faces
		outline: '#04141C',
		edge: '#BFF6FF',
		texture: 'ice',
		description: 'Ice'
	},
	'poison': {
		name: 'Poison',
		category: 'Damage Types',
		foreground: '#C9FF7A',
		background: ['#1C0630','#3B0F5C','#5B1F82'],
		outline: '#0D0318',
		edge: '#7CFC5A',
		texture: 'cloudy_2',
		description: 'Poison'
	},
	'acid': {
		name: 'Acid',
		category: 'Damage Types',
		foreground: '#E8FF6B',
		background: ['#1B2E00','#243D00','#0E1F00'],
		outline: 'black',
		edge: '#AEEA00',
		texture: 'marble',
		description: 'Acid'
	},
	'thunder': {
		name: 'Thunder',
		category: 'Damage Types',
		foreground: '#F5F7FA',
		background: ['#12151A','#262B33','#3C4450'],
		outline: '#000000',
		edge: '#8FA3B8',
		texture: 'glitter_2',
		description: 'Thunder'
	},
	'lightning': {
		name: 'Lightning',
		category: 'Damage Types',
		foreground: '#FFF04D',
		background: ['#0A0E2E','#161B4D','#232A75'],
		outline: '#000018',
		edge: '#7DF9FF',
		texture: 'glitter',
		description: 'Lightning'
	},
	'air': {
		name: 'Air',
		category: 'Damage Types',
		foreground: '#20323D',
		background: ['#EAF6FB','#D3ECF5','#B8DEEA'],
		outline: '#0D1418',
		edge: '#8FC7DE',
		texture: 'cloudy',
		description: 'Air'
	},
	'water': {
		name: 'Water',
		category: 'Damage Types',
		foreground: '#D7FBFF',
		background: ['#012A36','#01465A','#036B7D'],
		outline: '#001318',
		edge: '#4FD5EA',
		texture: 'water',
		description: 'Water'
	},
	'earth': {
		name: 'Earth',
		category: 'Damage Types',
		foreground: '#EDE0C8',
		background: ['#241608','#3E2612','#5C3A1E'],
		outline: '#120B04',
		edge: '#8A6D3B',
		texture: 'speckles',
		description: 'Earth'
	},
	'force': {
		name: 'Force',
		category: 'Damage Types',
		foreground: '#F5E9FF',
		background: ['#120A26','#241348','#38206B'],
		outline: '#0A0316',
		edge: '#C77DFF',
		texture: 'stars',
		description: 'Force'
	},
	'psychic': {
		name: 'Psychic',
		category: 'Damage Types',
		foreground: '#FFD6F5',
		background: ['#2E0A28','#4D1244','#6B1B5E'],
		outline: '#140412',
		edge: '#E85CC4',
		texture: 'astral',
		description: 'Psychic'
	},
	'necrotic': {
		name: 'Necrotic',
		category: 'Damage Types',
		foreground: '#D8D9C8',
		background: ['#0A0A08','#161611','#221F16'],
		outline: '#000000',
		edge: '#4B5320',
		texture: 'skulls',
		description: 'Necrotic'
	},
	'breebaby': {
		name: 'Pastel Sunset',
		category: 'Custom Sets',
		foreground: ['#5E175E', '#564A5E','#45455E','#3D5A5E','#1E595E','#5E3F3D','#5E1E29','#283C5E','#25295E'],
		background: ['#FE89CF', '#DFD4F2','#C2C2E8','#CCE7FA','#A1D9FC','#F3C3C2','#EB8993','#8EA1D2','#7477AD'],
		outline: 'white',
		texture: 'marble',
		description: 'Pastel Sunset, for Breyanna'
	},
	'pinkdreams': {
		name: 'Pink Dreams',
		category: 'Custom Sets',
		foreground: '#000000',
		background: ['#ff007c', '#df73ff','#f76cbe','#df00ff','#ff33cc'],
		outline: '#FFFFFF',
		edge: '#570000',
		texture: 'skulls',
		description: 'Pink Dreams, for Ethan'
	},
	'inspired': {
		name: 'Inspired',
		category: 'Custom Sets',
		foreground: '#3d3400',
		background: '#C4C4B6',
		outline: '#FFFFFF',
		texture: 'none',
		description: 'Inspired, for Austin'
	},
	'bloodmoon': {
		name: 'Blood Moon',
		category: 'Custom Sets',
		foreground: '#CDB800',
		background: '#6F0000',
		outline: 'black',
		texture: 'marble',
		description: 'Blood Moon, for Jared'
	},
	'starynight': {
		name: 'Stary Night',
		category: 'Custom Sets',
		foreground: ['#F5F8FF','#F5F8FF','#F5F8FF','#08131F','#08131F'],
		background: ['#050B18','#0F2038','#1A3350','#B9C7D6','#EFF2F5'],
		outline: 'black',
		texture: 'speckles',
		description: 'Stary Night, for Mai'
	},
	'glitterparty': {
		name: 'Glitter Party',
		category: 'Custom Sets',
		foreground: '#000000',
		background: ['#FFB5F5','#7FC9FF','#AE95FF'],
		outline: '#FFFFFF',
		texture: 'glitter',
		description: 'Glitter Party, for Austin'
	},
	'astralsea': {
		name: 'Astral Sea',
		category: 'Custom Sets',
		foreground: '#565656',
		background: 'white',
		outline: 'none',
		texture: 'astral',
		description: 'The Astral Sea, for Austin'
	},
	'bronze': {
		name: 'Thylean Bronze',
		description: 'Thylean Bronze by @SpencerThayer',
		category: 'Custom Sets',
		foreground: ['#FFE9C7','#FFEED2','#FFF3DD','#FFF7E6'],
		background: ['#644905','#704705','#643100','#7A2D06'],
		outline: ['#3D2D03','#472D04','#301700','#471A04'],
		edge: ['#FF5D0D','#FF7B00','#FFA20D','#FFBA0D'],
		texture: ['bronze01','bronze02','bronze03','bronze03a','bronze03b','bronze04']
	},
	'dragons': {
		name: 'Here be Dragons',
		category: 'Custom Sets',
		foreground: ['#FFFFFF', '#FFFFFF', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#FFFFFF', '#000000'],
		// 			[ red,       black,     blue,      green      white      gold,      silver,    bronze,    copper     brass
		background: ['#8C0000', '#4D5A5A', '#5BB8FF', '#9DB86B', '#F2F2F2', '#F6ED7C', '#8FB2C0', '#C4A25A', '#862C1A', '#FFDF8A'],
		outline: 'black',
		texture: ['dragon', 'lizard'],
		description: 'Here be Dragons'
	},
	'birdup': {
		name: 'Bird Up',
		category: 'Custom Sets',
		foreground: '#FFFFFF',
		background: ['#F11602', '#FFC000', '#6EC832', '#0094BC', '#05608D', '#FEABB3', '#F75680', '#F3F0DF', '#C7A57F'],
		outline: 'black',
		texture: 'bird',
		description: 'Bird Up!'
	},
	'tigerking': {
		name: 'Tiger King',
		category: 'Other',
		foreground: '#2B1B00',
		background: '#FFCC40',
		outline: 'white',
		texture: ['leopard', 'tiger', 'cheetah'],
		description: 'Leopard Print'
	},
	'covid': {
		name: 'COViD',
		category: 'Other',
		foreground: '#061400',
		background: ['#a6ff00', '#83b625','#5ace04','#69f006','#b0f006','#93bc25'],
		outline: 'black',
		texture: 'fire',
		description: 'Covid-19'
	},
	'acleaf': {
		name: 'Animal Crossing',
		category: 'Other',
		foreground: '#00FF00',
		background: '#07540A',
		outline: 'black',
		texture: 'acleaf',
		description: 'Animal Crossing Leaf'
	},
	'isabelle': {
		name: 'Isabelle',
		category: 'Other',
		foreground: 'white',
		background: '#FEE5CC',
		outline: 'black',
		texture: 'isabelle',
		description: 'Isabelle'
	},
	'thecage': {
		name: 'Nicholas Cage',
		category: 'Other',
		foreground: '#ffffff',
		background: '#1B1B1B',
		outline: 'black',
		texture: 'thecage',
		description: 'Nicholas Cage'
	},
	'test': {
		name: 'Test',
		category: 'Colors',
		foreground: ['#FFD6D6','#D2FFD2','#D2E0FF'],
		background: ['#7A0000','#0B5C0B','#001F7A'],
		outline: 'black',
		texture: 'none',
		description: 'Test'
	},
	'rainbow': {
		name: 'Rainblow',
		category: 'Colors',
		foreground: '#FFFFFF',
		background: ['#8B0000','#8A4B00','#6E6E00','#0F7D0F','#00008E','#005757','#6B0068'],
		outline: 'black',
		texture: 'none',
		description: 'Rainblow'
	},
	'black': {
		name: 'Black',
		category: 'Colors',
		foreground: '#ffffff',
		background: '#000000',
		outline: 'black',
		texture: 'none',
		description: 'Black',
	},
	'white': {
		name: 'White',
		category: 'Colors',
		foreground: '#000000',
		background: '#FFFFFF',
		outline: '#FFFFFF',
		texture: 'none',
		description: 'White'
	},
	
	
	'swrpg_abi': {
		name: 'Star Wars RPG - Ability',
		category: 'Star Wars™ RPG',
		foreground: '#00FF00',
		background: ['#3D9238','#52B848','#5EAC56','#9ECB9A'],
		outline: '#000000',
		texture: 'cloudy_2',
		description: 'Star Wars™ RPG Ability Dice'
	},
	'swrpg_pro': {
		name: 'Star Wars RPG - Proficiency',
		category: 'Star Wars™ RPG',
		foreground: '#FFFF00',
		background: ['#CABB1C','#F9E33B','#FFE900','#F0E49D'],
		outline: '#000000',
		texture: 'paper',
		description: 'Star Wars™ RPG Proficiency Dice'
	},
	'swrpg_dif': {
		name: 'Star Wars RPG - Difficulty',
		category: 'Star Wars™ RPG',
		foreground: '#FFFFFF',
		background: ['#39165F','#664B84','#50247E','#745F88'],
		outline: '#000000',
		texture: 'cloudy_2',
		description: 'Star Wars™ RPG Difficulty Dice'
	},
	'swrpg_cha': {
		name: 'Star Wars RPG - Challenge',
		category: 'Star Wars™ RPG',
		foreground: '#FFFFFF',
		background: ['#A91F32','#EB4254','#E51836','#BA3645'],
		outline: '#000000',
		texture: 'paper',
		description: 'Star Wars™ RPG Challenge Dice'
	},
	'swrpg_boo': {
		name: 'Star Wars RPG - Boost',
		category: 'Star Wars™ RPG',
		foreground: '#04101A',
		background: ['#4B9DC6','#689FC4','#85CFF2','#8FC0D8'],
		outline: '#FFFFFF',
		texture: 'glitter',
		description: 'Star Wars™ RPG Boost Dice'
	},
	'swrpg_set': {
		name: 'Star Wars RPG - Setback',
		category: 'Star Wars™ RPG',
		foreground: '#FFFFFF',
		background: ['#252223','#241F21','#282828','#111111'],
		outline: '#000000',
		texture: 'glitter',
		description: 'Star Wars™ RPG Setback Dice'
	},
	'swrpg_for': {
		name: 'Star Wars RPG - Force',
		category: 'Star Wars™ RPG',
		foreground: '#000000',
		background: ['#F3F3F3','#D3D3D3','#BABABA','#FFFFFF'],
		outline: '#FFFFFF',
		texture: 'stars',
		description: 'Star Wars™ RPG Force Dice'
	},
	
	
	'swa_red': {
		name: 'Armada Attack - Red',
		category: 'Star Wars™ Armada',
		foreground: '#ffffff',
		background: ['#440D19','#8A1425','#C72336','#C04551'],
		outline: 'black',
		texture: 'stainedglass',
		description: 'Star Wars™ Armada Red Attack Dice'
	},
	'swa_blue': {
		name: 'Armada Attack - Blue',
		category: 'Star Wars™ Armada',
		foreground: '#ffffff',
		background: ['#212642','#28286E','#2B348C','#3D4BB5','#5D64AB'],
		outline: 'black',
		texture: 'stainedglass',
		description: 'Star Wars™ Armada Blue Attack Dice'
	},
	'swa_black': {
		name: 'Armada Attack - Black',
		category: 'Star Wars™ Armada',
		foreground: '#ffffff',
		background: ['#252223','#241F21','#282828','#111111'],
		outline: 'none',
		texture: 'stainedglass',
		description: 'Star Wars™ Armada Black Attack Dice'
	},
	
	
	'xwing_red': {
		name: 'X-Wing Attack - Red',
		category: 'Star Wars™ X-Wing',
		foreground: '#ffffff',
		background: ['#440D19','#8A1425','#C72336','#C04551'],
		outline: 'black',
		texture: 'stars',
		description: 'Star Wars™ X-Wing Red Attack Dice'
	},
	'xwing_green': {
		name: 'X-Wing Attack - Green',
		category: 'Star Wars™ X-Wing',
		foreground: '#000000',
		background: ['#3D9238','#52B848','#5EAC56','#9ECB9A'],
		outline: '#FFFFFF',
		texture: 'stars',
		description: 'Star Wars™ X-Wing Green Attack Dice'
	},
	
	
	'swl_atkred': {
		name: 'Legion Attack - Red',
		category: 'Star Wars™ Legion',
		foreground: '#ffffff',
		background: ['#440D19','#8A1425','#C72336','#C04551'],
		outline: 'black',
		texture: 'fire',
		description: 'Star Wars™ Legion Red Attack Dice'
	},
	'swl_atkblack': {
		name: 'Legion Attack - Black',
		category: 'Star Wars™ Legion',
		foreground: '#ffffff',
		background: ['#252223','#241F21','#282828','#111111'],
		outline: 'none',
		texture: 'fire',
		description: 'Star Wars™ Legion Black Attack Dice'
	},
	'swl_atkwhite': {
		name: 'Legion Attack - White',
		category: 'Star Wars™ Legion',
		foreground: '#000000',
		background: ['#ffffff','#DFF4FA','#BCBCBC','#F1EDE2','#F2ECE0'],
		outline: 'none',
		texture: 'fire',
		description: 'Star Wars™ Legion White Attack Dice'
	},
	'swl_defred': {
		name: 'Legion Defense - Red',
		category: 'Star Wars™ Legion',
		foreground: '#ffffff',
		background: ['#440D19','#8A1425','#C72336','#C04551'],
		outline: 'black',
		texture: 'fire',
		description: 'Star Wars™ Legion Red Defense Dice'
	},
	'swl_defwhite': {
		name: 'Legion Defense - White',
		category: 'Star Wars™ Legion',
		foreground: '#000000',
		background: ['#ffffff','#DFF4FA','#BCBCBC','#F1EDE2','#F2ECE0'],
		outline: 'none',
		texture: 'fire',
		description: 'Star Wars™ Legion White Defense Dice'
	}
};