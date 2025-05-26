<script lang="ts">
	import { CirclePlus } from '@lucide/svelte';

	let { addFriend } = $props();

	let friendCodeInput = $state('');

	function handleAddFriend() {
		if (friendCodeInput.trim() === '') {
			alert('Please enter a friend code.');
			return;
		}
		addFriend(friendCodeInput.trim());
		friendCodeInput = '';
	}
</script>

<div class="add-friend-wrapper">
	<input type="text" placeholder="Enter Friend Code" bind:value={friendCodeInput} />
	<button onclick={handleAddFriend}><CirclePlus size={18} /> Add Friend</button>
</div>

<style>
	.add-friend-wrapper {
		display: flex;
		flex-direction: column; /* Stack input and button vertically */
		gap: 0.5rem; /* Space between input and button */
		padding: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1); /* Adjusted from original style */
	}

	input[type="text"] {
		width: 100%;
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(0,0,0,0.2);
		color: #fff;
		box-sizing: border-box; /* Ensure padding doesn't make it overflow */
	}

	button {
		width: 100%;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255,255,255,0.2); /* Added border for consistency */
		padding: 0.5rem 1rem;
		border-radius: 4px;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: .4rem;
		cursor: pointer;
		transition: background-color 0.2s ease-in-out;
	}
	button:hover {
		background: rgba(255,255,255,0.2);
	}
</style>
